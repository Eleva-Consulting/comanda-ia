// URL base da API. Em dev usa localhost, em produção a variável VITE_API_URL
// é injetada pelo Vercel apontando pro backend hospedado no Railway.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'