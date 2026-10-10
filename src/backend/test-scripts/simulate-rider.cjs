const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// =========================================================================
// CONFIGURATION
// =========================================================================
const BACKEND_URL = 'http://127.0.0.1:5000';
const ORDER_ID = '6a5bdcd04ed4b58342c2782f'; // Replace with your test order ID
const RIDER_ID = '6a08aac768c45b0d4e9a6ad3'; // A valid rider ID from your DB

// Coordinates from the diagnostic report
const RESTAURANT_COORDS = { latitude: 40.7306, longitude: -73.9352 }; // New York (Burger House)
const DELIVERY_COORDS = { latitude: 30.5154754, longitude: 72.6623969 }; // Punjab (Home)

const STEPS = 120; // Number of location updates to simulate the trip
const UPDATE_INTERVAL_MS = 2000; // Emit every 2 seconds

// =========================================================================
// SCRIPT
// =========================================================================

// Generate a valid JWT token for the test rider
const token = jwt.sign({ id: RIDER_ID }, process.env.JWT_SECRET, { expiresIn: '1d' });

console.log(`Connecting to backend at ${BACKEND_URL} as Rider ${RIDER_ID}...`);

const socket = io(BACKEND_URL, {
  auth: { token }
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server');
  
  let currentStep = 0;
  
  // Start simulation loop
  const interval = setInterval(() => {
    if (currentStep > STEPS) {
      clearInterval(interval);
      console.log('🏁 Simulation complete. Rider has reached the destination.');
      process.exit(0);
    }
    
    // Calculate intermediate point using linear interpolation
    const fraction = currentStep / STEPS;
    const currentLat = RESTAURANT_COORDS.latitude + (DELIVERY_COORDS.latitude - RESTAURANT_COORDS.latitude) * fraction;
    const currentLng = RESTAURANT_COORDS.longitude + (DELIVERY_COORDS.longitude - RESTAURANT_COORDS.longitude) * fraction;
    
    const payload = {
      orderId: ORDER_ID,
      latitude: currentLat,
      longitude: currentLng,
      accuracy: 5.0,
      heading: 90.0,
      speed: 15.0
    };
    
    console.log(`📡 Emitting rider:location -> [Lat: ${currentLat.toFixed(5)}, Lng: ${currentLng.toFixed(5)}]`);
    socket.emit('rider:location', payload);
    
    currentStep++;
  }, UPDATE_INTERVAL_MS);
});

socket.on('location:updated', (data) => {
  console.log('✅ Server acknowledged location update:', data);
});

socket.on('error', (err) => {
  console.error('❌ Server returned an error:', err);
});

socket.on('connect_error', (err) => {
  console.error('❌ Connection error:', err.message);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected from WebSocket server');
});
