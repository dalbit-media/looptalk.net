import axios from "axios";
import { API_URL } from "../config/environment";

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
});