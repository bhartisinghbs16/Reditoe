const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function fetchOrder() {
  try {
    const adminUserToken = jwt.sign({ id: '605bdcd04ed4b58342c2782a', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await axios.get(`http://127.0.0.1:5000/api/admin/orders`, {
      headers: { Authorization: `Bearer ${adminUserToken}` }
    });
    
    // Find order AAA-645
    const order = res.data.data.orders.find(o => o.orderNumber === 'AAA-645' || String(o._id).endsWith('645'));
    if (order) {
      console.log(JSON.stringify(order, null, 2));
    } else {
      console.log('Order AAA-645 not found, here is the last order:');
      console.log(JSON.stringify(res.data.data.orders[res.data.data.orders.length - 1], null, 2));
    }
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
fetchOrder();
