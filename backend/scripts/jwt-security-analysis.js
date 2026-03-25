#!/usr/bin/env node
/* eslint-disable no-console */
const axios = require("axios");
const { randomUUID } = require("crypto");

const BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:5000";
const ADMIN_EMAIL = process.env.JWT_TEST_ADMIN_EMAIL || process.env.ROOT_ADMIN_EMAIL || "admin@usach.cl";
const ADMIN_PASSWORD = process.env.JWT_TEST_ADMIN_PASSWORD || "admin";

async function main() {
  const tempPassword = `Tmp-${randomUUID()}-A1!`;
  const tempEmail = `jwt-analysis-${Date.now()}@usach.cl`;
  const tempUsername = `jwt_analysis_${Date.now()}`;
  const summary = {
    baseUrl: BASE_URL,
    executedAt: new Date().toISOString(),
    checks: [],
  };

  const api = axios.create({ baseURL: BASE_URL, timeout: 15000, validateStatus: () => true });

  const adminLogin = await api.post("/api/auth/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  const adminToken = adminLogin.data?.accessToken;
  summary.checks.push({
    test: "Login admin con JWT",
    expected: "HTTP 200 y accessToken presente",
    statusCode: adminLogin.status,
    ok: adminLogin.status === 200 && Boolean(adminToken),
  });
  if (!adminToken) {
    throw new Error("No se pudo iniciar sesión como admin para continuar las pruebas JWT.");
  }

  const createdUser = await api.post("/api/users/register", {
    username: tempUsername,
    email: tempEmail,
    password: tempPassword,
    role: "estudiante",
  });
  const userId = createdUser.data?.user?.id;
  summary.checks.push({
    test: "Crear usuario para prueba",
    expected: "HTTP 201 con id de usuario",
    statusCode: createdUser.status,
    ok: createdUser.status === 201 && Number.isFinite(Number(userId)),
    userId,
  });
  if (!userId) {
    throw new Error("No se pudo crear usuario temporal para las pruebas.");
  }

  const noTokenRoleChange = await api.put(`/api/users/${userId}/role`, { role: "funcionario" });
  summary.checks.push({
    test: "Cambio de rol SIN JWT",
    expected: "HTTP 401 por falta de token",
    statusCode: noTokenRoleChange.status,
    ok: noTokenRoleChange.status === 401,
  });

  const adminRoleChange = await api.put(
    `/api/users/${userId}/role`,
    { role: "funcionario" },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  summary.checks.push({
    test: "Cambio de rol CON JWT admin",
    expected: "HTTP 200 y newRole='funcionario'",
    statusCode: adminRoleChange.status,
    ok: adminRoleChange.status === 200 && adminRoleChange.data?.newRole === "funcionario",
  });

  const userLogin = await api.post("/api/auth/login", {
    email: tempEmail,
    password: tempPassword,
  });
  const userToken = userLogin.data?.accessToken;
  summary.checks.push({
    test: "Login usuario temporal",
    expected: "HTTP 200 y accessToken presente",
    statusCode: userLogin.status,
    ok: userLogin.status === 200 && Boolean(userToken),
  });

  const userSelfRoleChange = await api.put(
    `/api/users/${userId}/role`,
    { role: "admin" },
    { headers: { Authorization: `Bearer ${userToken}` } }
  );
  summary.checks.push({
    test: "Mismo usuario intenta cambiar su rol",
    expected: "HTTP 403 por rol insuficiente",
    statusCode: userSelfRoleChange.status,
    ok: userSelfRoleChange.status === 403,
  });

  summary.ok = summary.checks.every((check) => check.ok);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((error) => {
  const fallbackMessage = error?.message || error?.code || error?.cause?.message || String(error);
  console.error(
    JSON.stringify(
      {
        ok: false,
        baseUrl: BASE_URL,
        error: fallbackMessage,
      },
      null,
      2
    )
  );
  process.exit(1);
});