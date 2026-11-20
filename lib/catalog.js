// Canonical server-side vendor & directory registry for Truckly.
// Placed in lib/ (outside api/) to keep domain handlers separate from shared modules.

export const BOOKING_PACKAGES = Object.freeze({
  dropin: Object.freeze({ id: 'dropin', name: 'Neighborhood Drop-in', price: 750, max: 50 }),
  party: Object.freeze({ id: 'party', name: 'Party Favorite', price: 1500, max: 100 }),
  festival: Object.freeze({ id: 'festival', name: 'Full Festival', price: 2900, max: 250 })
});

// 47 primary Sonoma County catalog listings (event_bookable: true) + 12 v77 neighborhood directory places (event_bookable: false)
export const CANONICAL_VENDORS = Object.freeze([
  { id: 'ross', name: 'Ross Street Food Trucks', city: 'Santa Rosa', cuisine: 'Global', kind: 'popup', event_bookable: true },
  { id: 'mitote', name: 'Mitote Food Park', city: 'Santa Rosa', cuisine: 'Mexican', kind: 'venue', event_bookable: true },
  { id: 'jalapeno', name: 'Jalapeño Mexican Grill', city: 'Santa Rosa', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'iniguez', name: 'Tacos Iñiguez', city: 'Santa Rosa', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'elenita', name: 'Delicias Elenita', city: 'Santa Rosa', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'sunny', name: 'Sunny Cafe & Tacos', city: 'Santa Rosa', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'magos', name: 'Gio y Los Magos', city: 'Santa Rosa', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'elroys', name: "El Roy's Express Mex", city: 'Santa Rosa', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'lucha', name: 'Lucha Sabina', city: 'Santa Rosa', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'elroys-pet-1', name: "El Roy's Taco Truck", city: 'Petaluma', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'elroys-pet-2', name: "El Roy's Food Truck #2", city: 'Petaluma', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'holy-chile', name: 'Holy Chile Mole', city: 'Petaluma', cuisine: 'Mexican', kind: 'food_truck', event_bookable: true },
  { id: 'block', name: 'The Block Petaluma', city: 'Petaluma', cuisine: 'Global', kind: 'venue', event_bookable: true },
  { id: 'faron', name: "Faron's New Orleans BBQ", city: 'Sonoma', cuisine: 'Global', kind: 'food_truck', event_bookable: true },
  { id: 'gameday', name: 'Gameday Grill', city: 'Santa Rosa', cuisine: 'Burgers', kind: 'food_truck', event_bookable: true },
  { id: 'munchiez', name: 'Bay Area Munchiez', city: 'Santa Rosa', cuisine: 'Burgers', kind: 'food_truck', event_bookable: true },
  { id: 'char', name: 'The Char Market', city: 'Santa Rosa', cuisine: 'Burgers', kind: 'food_truck', event_bookable: true },
  { id: 'onion', name: 'The Onion Bomb', city: 'Santa Rosa', cuisine: 'Burgers', kind: 'food_truck', event_bookable: true },
  { id: 'adams', name: "Adam's Grub Truck", city: 'Santa Rosa', cuisine: 'Burgers', kind: 'food_truck', event_bookable: true },
  { id: 'cichy', name: 'Cichy Co.', city: 'Santa Rosa', cuisine: 'Burgers', kind: 'food_truck', event_bookable: true },
  { id: 'worldfare', name: 'World Fare Food Truck', city: 'Santa Rosa', cuisine: 'Burgers', kind: 'food_truck', event_bookable: true },
  { id: 'dogaday', name: 'A Dog A Day', city: 'Santa Rosa', cuisine: 'Hot Dogs', kind: 'food_truck', event_bookable: true },
  { id: 'streetdogz', name: 'Streetdogz & Streetburgerz', city: 'Santa Rosa', cuisine: 'Hot Dogs', kind: 'food_truck', event_bookable: true },
  { id: 'sausage', name: 'The Sausage Truck', city: 'Santa Rosa', cuisine: 'Hot Dogs', kind: 'food_truck', event_bookable: true },
  { id: 'hefty', name: 'Hefty Gyros', city: 'Santa Rosa', cuisine: 'Global', kind: 'food_truck', event_bookable: true },
  { id: 'momo', name: 'MoMo Man', city: 'Santa Rosa', cuisine: 'Global', kind: 'food_truck', event_bookable: true },
  { id: 'xies', name: 'Xies707 Sushi Rolls', city: 'Santa Rosa', cuisine: 'Global', kind: 'food_truck', event_bookable: true },
  { id: 'api-hot', name: 'API Hot Chicken', city: 'Santa Rosa', cuisine: 'Global', kind: 'food_truck', event_bookable: true },
  { id: 'dinos', name: "Dino's Greek Food", city: 'Santa Rosa', cuisine: 'Global', kind: 'food_truck', event_bookable: true },
  { id: 'dang', name: "Dang That's Good", city: 'Santa Rosa', cuisine: 'Global', kind: 'food_truck', event_bookable: true },
  { id: 'drip', name: 'Drip Sandwiches', city: 'Santa Rosa', cuisine: 'Global', kind: 'food_truck', event_bookable: true },
  { id: 'fruta', name: 'Fru-ta Ice Cream Truck', city: 'Santa Rosa', cuisine: 'Sweets', kind: 'food_truck', event_bookable: true },
  { id: 'heritage', name: 'Best Food Truck Ever by Heritage Eats', city: 'Santa Rosa', cuisine: 'Sweets', kind: 'food_truck', event_bookable: true },
  { id: 'andrew', name: 'Mr. Andrew Food Trailer', city: 'Santa Rosa', cuisine: 'Sweets', kind: 'food_truck', event_bookable: true },
  { id: 'kolobok', name: 'Kolobok Russian Soul Food Truck', city: 'Santa Rosa', cuisine: 'Global', kind: 'food_truck', event_bookable: true },
  { id: 'rich', name: "Little Rich's Italian Ice", city: 'Santa Rosa', cuisine: 'Sweets', kind: 'food_truck', event_bookable: true },
  { id: 'momolicious', name: 'Momolicious', city: 'Santa Rosa', cuisine: 'Sweets', kind: 'food_truck', event_bookable: true },
  { id: 'market-chavas', name: "Chava's Pizza", city: 'Petaluma', cuisine: 'Global', kind: 'market_stall', event_bookable: true },
  { id: 'market-myriad', name: 'Myriad Coffee', city: 'Petaluma', cuisine: 'Sweets', kind: 'market_stall', event_bookable: true },
  { id: 'market-chicken', name: 'What A Chicken!?', city: 'Petaluma', cuisine: 'Global', kind: 'market_stall', event_bookable: true },
  { id: 'market-donpepe', name: 'Tacos Don Pepe', city: 'Petaluma', cuisine: 'Mexican', kind: 'market_stall', event_bookable: true },
  { id: 'market-sushi', name: 'Sushi Shoubu', city: 'Petaluma', cuisine: 'Global', kind: 'market_stall', event_bookable: true },
  { id: 'market-boba', name: 'Bai Chai Boba Tea', city: 'Petaluma', cuisine: 'Sweets', kind: 'market_stall', event_bookable: true },
  { id: 'market-urban', name: 'Urban Deli', city: 'Petaluma', cuisine: 'Global', kind: 'market_stall', event_bookable: true },
  { id: 'market-roti', name: 'Roti', city: 'Petaluma', cuisine: 'Global', kind: 'market_stall', event_bookable: true },
  { id: 'market-mifiesta', name: 'Mi Fiesta Catering Co.', city: 'Petaluma', cuisine: 'Mexican', kind: 'market_stall', event_bookable: true },
  { id: 'market-fusion', name: 'Fusion 2 Go', city: 'Petaluma', cuisine: 'Global', kind: 'market_stall', event_bookable: true },
  // 12 v77 neighborhood directory places (community-reviewable, not direct Truckly catering targets)
  { id: 'farm-oakhill', name: 'Oak Hill Farm — Red Barn Store', city: 'Glen Ellen', cuisine: 'Farm produce', kind: 'farm_stand', event_bookable: false },
  { id: 'farm-barn', name: 'Farm Barn', city: 'Petaluma', cuisine: 'Eggs & farm goods', kind: 'farm_stand', event_bookable: false },
  { id: 'market-sr-community', name: 'Santa Rosa Community Farmers Market', city: 'Santa Rosa', cuisine: 'Farmers market', kind: 'venue', event_bookable: false },
  { id: 'market-sr-original', name: 'Santa Rosa Original Certified Farmers Market', city: 'Santa Rosa', cuisine: 'Farmers market', kind: 'venue', event_bookable: false },
  { id: 'truck-galvans', name: "Galvan’s Eatery", city: 'Sonoma County', cuisine: 'Mexican-American', kind: 'popup', event_bookable: false },
  { id: 'truck-flippin', name: 'Los Flippin Tacos', city: 'Sonoma County', cuisine: 'Mexican', kind: 'popup', event_bookable: false },
  { id: 'truck-casanostra', name: 'Casa Nostra NorCal', city: 'Rohnert Park', cuisine: 'Pizza & pasta', kind: 'popup', event_bookable: false },
  { id: 'truck-thespot', name: 'The Spot Food Truck', city: 'Sonoma County', cuisine: 'Burgers & sandwiches', kind: 'popup', event_bookable: false },
  { id: 'coffee-crooks', name: 'Crooks Coffee', city: 'Santa Rosa', cuisine: 'Coffee & café', kind: 'cafe', event_bookable: false },
  { id: 'coffee-retrograde', name: 'Retrograde Coffee Roasters', city: 'Sebastopol', cuisine: 'Coffee & café', kind: 'cafe', event_bookable: false },
  { id: 'coffee-avid-petaluma', name: 'Avid Coffee — Downtown Petaluma', city: 'Petaluma', cuisine: 'Coffee & café', kind: 'cafe', event_bookable: false },
  { id: 'coffee-avid-sr', name: 'Avid Coffee — Montgomery Village', city: 'Santa Rosa', cuisine: 'Coffee & café', kind: 'cafe', event_bookable: false }
]);

export const VENDORS_BY_ID = Object.freeze(
  Object.fromEntries(CANONICAL_VENDORS.map(v => [v.id, Object.freeze(v)]))
);

export function getCanonicalVendor(vendorId) {
  if (typeof vendorId !== 'string') return null;
  const clean = vendorId.trim();
  return Object.prototype.hasOwnProperty.call(VENDORS_BY_ID, clean) ? VENDORS_BY_ID[clean] : null;
}
