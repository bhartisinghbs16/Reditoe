const jwt = require('jsonwebtoken');

async function run() {
  const JWT_SECRET = process.env.JWT_SECRET || 'reditoe_jwt_secret_key_2024'; // fallback if not in env
  
  // 1. Generate Admin Token for status update
  const adminId = '6a08297b68c45b0d4e9a6163'; 
  const adminToken = jwt.sign({ id: adminId }, JWT_SECRET, { expiresIn: '1h' });

  // 2. Generate User Token for reading notifications
  const userId = '6a3af7db9316a93ea68efd2b';
  const userToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });

  const orderId = '6a5bdcd04ed4b58342c2782f';
  const targetStatus = 'OnWay'; // Maps to order_on_the_way

  console.log(`[Admin] Changing order status to ${targetStatus}...`);
  try {
    const patchRes = await fetch(`http://localhost:5000/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: targetStatus, bypassTransitionCheck: true })
    });
    
    const patchData = await patchRes.json();
    console.log(`[Admin] Status Code: ${patchRes.status}`);
    console.log(`[Admin] Response Message: ${patchData.message}`);
    
    if (patchRes.status !== 200) {
      console.error(patchData);
      return;
    }

    console.log(`\n[User] Fetching notifications to verify...`);
    const getRes = await fetch(`http://localhost:5000/api/notifications?limit=3`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      }
    });
    
    const getData = await getRes.json();
    console.log(`[User] Status Code: ${getRes.status}`);
    if (getData.data && getData.data.notifications) {
      console.log(`[User] Notifications Found: ${getData.data.notifications.length}`);
      console.log(JSON.stringify(getData.data.notifications.slice(0, 2), null, 2));
    } else {
      console.log(getData);
    }
    
    // Revert it back!
    console.log(`\n[Admin] REVERTING order status back to Waiting for Confirmation...`);
    await fetch(`http://localhost:5000/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'Waiting for Confirmation', bypassTransitionCheck: true })
    });
    console.log(`[Admin] Revert completed.`);

  } catch (err) {
    console.error('Error during fetch:', err);
  }
}

run();
