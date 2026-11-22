// BiteShark Code Registry — Zero-Dependency Recursive JSON Schema Validator
// (`tools/code-registry/schema-validator.mjs`)
//
// Enforces the Draft 2020-12 subset used across `docs/engineering/schemas/*.schema.json`:
//   - `$defs` and local `#/$defs/<Name>` `$ref`
//   - `type` (single type or union array: object, array, string, number, integer, boolean, null)
//   - `const`, `enum`
//   - `required`, `properties`, `additionalProperties`, `patternProperties`
//   - `items`, `minItems`, `maxItems`, `uniqueItems`
//   - `minLength`, `maxLength`, `pattern`
//   - `minimum`, `maximum`
//   - `anyOf`, `oneOf`

import fs from 'node:fs';

function matchesPrimitiveType(val, expectedType) {
  switch (expectedType) {
    case 'null':
      return val === null;
    case 'boolean':
      return typeof val === 'boolean';
    case 'string':
      return typeof val === 'string';
    case 'number':
      return typeof val === 'number' && Number.isFinite(val);
    case 'integer':
      return typeof val === 'number' && Number.isInteger(val);
    case 'array':
      return Array.isArray(val);
    case 'object':
      return val !== null && typeof val === 'object' && !Array.isArray(val);
    default:
      return false;
  }
}

function describeValueType(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'number';
  return typeof val;
}

function deepEqualJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolveRef(ref, rootSchema) {
  if (typeof ref !== 'string') return null;
  if (ref === '#') return rootSchema;
  const prefix = '#/$defs/';
  if (ref.startsWith(prefix)) {
    const key = decodeURIComponent(ref.slice(prefix.length));
    return rootSchema?.$defs?.[key] || null;
  }
  return null;
}

export function validateAgainstJsonSchema(value, schema, { rootSchema = schema, pointer = '' } = {}) {
  const errors = [];
  const loc = pointer || '/';

  if (!schema || typeof schema !== 'object') {
    return [`${loc}: invalid or missing schema definition.`];
  }

  if (schema.$ref) {
    const target = resolveRef(schema.$ref, rootSchema);
    if (!target) {
      return [`${loc}: unresolved schema $ref "${schema.$ref}".`];
    }
    errors.push(
      ...validateAgainstJsonSchema(value, target, {
        rootSchema,
        pointer
      })
    );
    // Allow sibling keywords alongside $ref per Draft 2020-12
  }

  if (schema.anyOf) {
    const passesAny = schema.anyOf.some(
      sub => validateAgainstJsonSchema(value, sub, { rootSchema, pointer }).length === 0
    );
    if (!passesAny) {
      errors.push(`${loc}: value (${describeValueType(value)}) did not satisfy any schema in anyOf.`);
      return errors;
    }
  }

  if (schema.oneOf) {
    const matchCount = schema.oneOf.filter(
      sub => validateAgainstJsonSchema(value, sub, { rootSchema, pointer }).length === 0
    ).length;
    if (matchCount !== 1) {
      errors.push(`${loc}: expected value to match exactly 1 schema in oneOf, matched ${matchCount}.`);
      return errors;
    }
  }

  if (schema.type !== undefined) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = allowedTypes.some(t => matchesPrimitiveType(value, t));
    if (!ok) {
      errors.push(`${loc}: expected type ${allowedTypes.join('|')}, got ${describeValueType(value)}.`);
      return errors;
    }
  }

  if ('const' in schema) {
    if (!deepEqualJson(value, schema.const)) {
      errors.push(`${loc}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}.`);
    }
  }

  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some(item => deepEqualJson(value, item))) {
      errors.push(`${loc}: value ${JSON.stringify(value)} is not in enum [${schema.enum.map(x => JSON.stringify(x)).join(', ')}].`);
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${loc}: string length ${value.length} is less than minLength ${schema.minLength}.`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${loc}: string length ${value.length} exceeds maxLength ${schema.maxLength}.`);
    }
    if (typeof schema.pattern === 'string') {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) {
        errors.push(`${loc}: string ${JSON.stringify(value)} does not match pattern /${schema.pattern}/.`);
      }
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${loc}: number ${value} is less than minimum ${schema.minimum}.`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${loc}: number ${value} exceeds maximum ${schema.maximum}.`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${loc}: array length ${value.length} is less than minItems ${schema.minItems}.`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${loc}: array length ${value.length} exceeds maxItems ${schema.maxItems}.`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (let i = 0; i < value.length; i++) {
        const key = JSON.stringify(value[i]);
        if (seen.has(key)) {
          errors.push(`${pointer}/${i}: duplicate item violates uniqueItems.`);
        }
        seen.add(key);
      }
    }
    if (schema.items && typeof schema.items === 'object') {
      for (let i = 0; i < value.length; i++) {
        const itemErrors = validateAgainstJsonSchema(value[i], schema.items, {
          rootSchema,
          pointer: `${pointer}/${i}`
        });
        if (itemErrors.length > 0) {
          errors.push(...itemErrors);
          if (errors.length >= 40) return errors;
        }
      }
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (!(reqKey in value) || value[reqKey] === undefined) {
          errors.push(`${loc}: missing required property "${reqKey}".`);
        }
      }
    }

    const definedProps = schema.properties || {};
    const patternProps = schema.patternProperties || {};
    const compiledPatterns = Object.entries(patternProps).map(([pat, sub]) => [new RegExp(pat), sub]);

    for (const key of Object.keys(value)) {
      const escapedKey = key.replace(/~/g, '~0').replace(/\//g, '~1');
      const childPointer = `${pointer}/${escapedKey}`;
      let matchedDefinedOrPattern = false;

      if (Object.prototype.hasOwnProperty.call(definedProps, key)) {
        matchedDefinedOrPattern = true;
        errors.push(
          ...validateAgainstJsonSchema(value[key], definedProps[key], {
            rootSchema,
            pointer: childPointer
          })
        );
      }

      for (const [re, sub] of compiledPatterns) {
        if (re.test(key)) {
          matchedDefinedOrPattern = true;
          errors.push(
            ...validateAgainstJsonSchema(value[key], sub, {
              rootSchema,
              pointer: childPointer
            })
          );
        }
      }

      if (!matchedDefinedOrPattern) {
        if (schema.additionalProperties === false) {
          errors.push(`${loc}: unexpected additional property "${key}".`);
        } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          errors.push(
            ...validateAgainstJsonSchema(value[key], schema.additionalProperties, {
              rootSchema,
              pointer: childPointer
            })
          );
        }
      }

      if (errors.length >= 40) return errors;
    }
  }

  return errors;
}

export function validateJsonWithSchemaFile(value, schemaPath) {
  if (!fs.existsSync(schemaPath)) {
    return [`Missing JSON Schema file at ${schemaPath}.`];
  }
  let schemaObj;
  try {
    schemaObj = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (err) {
    return [`Failed to parse JSON Schema at ${schemaPath}: ${err.message}`];
  }
  return validateAgainstJsonSchema(value, schemaObj);
}
