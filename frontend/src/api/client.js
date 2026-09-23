import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const OPERATOR_KEY = 'operatorId';

// No login yet. Each laptop can pick its operator once with ?operator=OP1002;
// it is remembered in this browser. Without it the backend default (OP1001) is used.
function selectedOperator() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('operator');
    if (fromUrl) localStorage.setItem(OPERATOR_KEY, fromUrl.toUpperCase());
    return localStorage.getItem(OPERATOR_KEY);
  } catch {
    return null;
  }
}

const operatorId = selectedOperator();

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  if (operatorId) config.params = { ...(config.params || {}), operatorId };
  return config;
});
