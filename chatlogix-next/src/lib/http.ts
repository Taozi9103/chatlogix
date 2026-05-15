import axios from 'axios';

const http = axios.create();

http.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      if (!('Authorization' in config.headers)) {
        (config.headers as any).Authorization = `Bearer ${token}`;
      }
    }
  }
  return config;
});

export default http;

