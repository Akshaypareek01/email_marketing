import axios from "axios";

const BASE_URL = process.env.STALWART_URL;

export function basicAuth(user, pass) {
  return Buffer.from(`${user}:${pass}`).toString("base64");
}

export async function stalwartRequest(path, options = {}) {
  const auth = basicAuth(
    process.env.STALWART_ADMIN,
    process.env.STALWART_PASSWORD
  );

  try {
    const res = await axios({
      url: `${BASE_URL}${path}`,
      method: options.method || "GET",
      data: options.body ? JSON.parse(options.body) : undefined,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    return res.data;
  } catch (err) {
    throw new Error(
      err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message
    );
  }
}