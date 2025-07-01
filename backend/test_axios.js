const axios = require('axios');

// Mock axios.post
axios.post = jest.fn(() => Promise.resolve({ data: { id: 1, username: 'testuser', email: 'test@example.com', role: 'estudiante' } }));

async function testAxios() {
  console.log('Before axios.post call', axios.post.getMockImplementation());
  const result = await axios.post('/api/login', { email: 'test@example.com', password: 'password123' });
  console.log('After axios.post call', axios.post.getMockImplementation());
  console.log(result.data);
}

testAxios();