module.exports = {
  async rewrites() {
    return process.env.NODE_ENV === 'development' 
      ? [{
          source: '/api/:path*',
          destination: 'http://localhost:5000/api/:path*'
        }]
      : [];
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000',
  }
}