import { api } from "./client";

const authorization = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export const listPolls = async (token, page = 1, scope = "public", includeGuests = false) =>
  (await api.get("/forum/polls", { ...authorization(token), params: { page, scope, includeGuests } })).data;

export const getPoll = async (token, id) =>
  (await api.get(`/forum/polls/${id}`, authorization(token))).data;

export const createPoll = async (token, question, options, visibility = "contacts", tags) =>
  (await api.post("/forum/polls", { question, options, visibility, ...(tags === undefined ? {} : { tags }) }, authorization(token))).data;

export const setPollVisibility = async (token, id, visibility) =>
  (await api.patch(`/forum/polls/${id}/visibility`, { visibility }, authorization(token))).data;

export const vote = async (token, id, optionId) =>
  (await api.post(`/forum/polls/${id}/vote`, { optionId }, authorization(token))).data;

export const reactToPoll = async (token, id, emoji) =>
  (await api.post(`/forum/polls/${id}/reactions`, { emoji }, authorization(token))).data;

export const listComments = async (token, id, page = 1) =>
  (await api.get(`/forum/polls/${id}/comments`, { ...authorization(token), params: { page } })).data;

export const postComment = async (token, id, content) =>
  (await api.post(`/forum/polls/${id}/comments`, { content }, authorization(token))).data;
