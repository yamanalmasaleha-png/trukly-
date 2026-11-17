CREATE TABLE IF NOT EXISTS pickup_pagers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_key uuid NOT NULL UNIQUE,
 vendor text NOT NULL CHECK (char_length(vendor) BETWEEN 1 AND 80),
 ticket text NOT NULL CHECK (char_length(ticket) BETWEEN 1 AND 40),
 status text NOT NULL DEFAULT 'cooking' CHECK (status IN ('cooking','almost','ready','collected','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);