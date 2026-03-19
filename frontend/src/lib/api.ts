import axios from "axios";
import Cookies from "js-cookie";

const api = axios.create({
  baseURL: "/api/backend",
  headers: { "Content-Type": "application/json" },
});

// Request interceptor: inject JWT
api.interceptors.request.use((config) => {
  const token = Cookies.get("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove("token");
      Cookies.remove("userId");
      Cookies.remove("role");
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export default api;
