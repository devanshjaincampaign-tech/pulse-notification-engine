export const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? 'https://your-real-frontend.com' : '*',
  credentials: true,
};