/* Source-backed directory additions for the original Truckly app.
   No simulated location, live hours, customer rating, price, or logo. */
(function(){
  'use strict';
  if(typeof neighborhoodAdditions==='undefined')return;
  const checked='November 16, 2026';
  const records=[
    {
      id:'truck-sabor-family-meal',name:'SABOR Food Truck',kind:'Food Trucks',
      cuisine:'Global flavors',city:'Sonoma County',emoji:'🥙',popup:true,
      blurb:'A mobile kitchen from Sonoma Family Meal. Its globally inspired menu supports culinary job training and community meals.',
      location:'Rotating Sonoma County events and markets · confirm the next stop',
      hours:'Check Sonoma Family Meal for the current schedule and event availability',
      source:'https://www.sonomafamilymeal.org/blog/sabor-food-truck-is-here-locally-serving-global-flavors',
      tags:['Food Trucks','Global']
    },
    {
      id:'truck-lilas-streetside',name:'Lila’s Streetside Eats',kind:'Food Trucks',
      cuisine:'Creative pub fare',city:'Sonoma County',emoji:'🍔',popup:true,
      blurb:'A Sonoma County food truck serving a changing menu of creative pub-style dishes, with event catering available.',
      location:'Rotating Sonoma County stops · see the latest vendor schedule',
      hours:'Check the vendor’s latest updates before visiting',
      source:'https://www.norcalfoodtrucks.org/the-trucks/lilas-streetside-eats',
      tags:['Food Trucks','Global']
    },
    {
      id:'cart-damn-dogs',name:'Damn Dogs!',kind:'Food Trucks',
      cuisine:'Gourmet sausages',city:'Sonoma County',emoji:'🌭',popup:true,
      blurb:'A Sonoma County mobile hot-dog and gourmet sausage cart that also offers event catering.',
      location:'Mobile cart · location changes by event',
      hours:'Follow the vendor for current stops and dates',
      source:'https://www.norcalfoodtrucks.org/the-trucks/damn-dogs',
      tags:['Food Trucks','Hot Dogs']
    },
    {
      id:'cart-sausage-slinger',name:'Sausage Slinger',kind:'Food Trucks',
      cuisine:'Locally minded sausages',city:'Sonoma County',emoji:'🌭',popup:true,
      blurb:'A small red mobile kitchen serving sausage-focused American fare, with ingredients sourced locally when possible.',
      location:'Rotating local events · the association page may contain older dates',
      hours:'Verify current activity and locations directly with the vendor',
      source:'https://www.norcalfoodtrucks.org/the-trucks/sausage-slinger',
      tags:['Food Trucks','Hot Dogs']
    },
    {
      id:'mobile-crafted-cup',name:'Crafted Cup',kind:'Coffee',
      cuisine:'Espresso & mobile beverages',city:'Sonoma County',emoji:'☕',popup:true,
      blurb:'A traveling espresso bar and tap trailer that appears at festivals and is available for private events.',
      location:'Mobile espresso bar · rotating Sonoma County locations',
      hours:'Check the latest event calendar or ask about catering availability',
      source:'https://www.norcalfoodtrucks.org/the-trucks/crafted-cup',
      tags:['Coffee','Food Trucks']
    },
    {
      id:'mobile-crepes-du-jour',name:'Crêpes du Jour',kind:'Food Trucks',
      cuisine:'Sweet & savory crêpes',city:'Sonoma County',emoji:'🥞',popup:true,
      blurb:'A mobile crêpe vendor appearing at farmers markets and local events with both sweet and savory choices.',
      location:'Sonoma County farmers markets and events · check the organizer',
      hours:'Published market schedules can change; confirm the current stop',
      source:'https://www.norcalfoodtrucks.org/the-trucks/crepes-du-jour',
      tags:['Food Trucks','Sweets','Markets']
    },
    {
      id:'popup-the-wurst',name:'The Wurst Catering',kind:'Food Trucks',
      cuisine:'Brats, burgers & fries',city:'Sonoma County',emoji:'🌭',popup:true,
      blurb:'A gourmet sausage and burger pop-up and catering business serving Sonoma, Marin, and Napa counties.',
      location:'Pop-up and event catering · current stop varies',
      hours:'Check the official site for future dated events',
      source:'https://thewurstcatering.com/',
      tags:['Food Trucks','Hot Dogs','Burgers']
    }
  ];
  const existing=new Set(neighborhoodAdditions.map(item=>item.id));
  for(const item of records){
    if(existing.has(item.id))continue;
    neighborhoodAdditions.push({
      ...item,extra:true,open:null,distance:null,lat:null,lng:null,
      rating:null,reviews:null,price:'',color:'#debb8a',verified:false,
      photo:null,listing_type:item.kind,checked
    });
  }
})();