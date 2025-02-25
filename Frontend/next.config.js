module.exports = {
  async rewrites() {
    return process.env.NODE_ENV === 'development' 
      ? [{
          source: '/api/:path*',
          destination: 'http://localhost:5000/api/:path*'
        }]
      : [];
  },
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    }
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000',
  }
}