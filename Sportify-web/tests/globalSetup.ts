import mysql from "mysql2/promise";

// Recreates the test database from the checked-in migrations, so every run
// also proves the migrations build a working schema from scratch.
export default async function setup() {
  const env = {
    host:     process.env.MYSQL_HOST     ?? "127.0.0.1",
    port:     Number(process.env.MYSQL_PORT ?? 3306),
    user:     process.env.MYSQL_USER     ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "test",
  };
  const database = process.env.MYSQL_DATABASE ?? "sportify_test";
  if (!/test/.test(database)) throw new Error(`Refusing to reset non-test database "${database}"`);

  const admin = await mysql.createConnection(env);
  await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await admin.query(`CREATE DATABASE \`${database}\``);
  await admin.end();

  Object.assign(process.env, {
    MYSQL_HOST: env.host, MYSQL_PORT: String(env.port), MYSQL_USER: env.user,
    MYSQL_PASSWORD: env.password, MYSQL_DATABASE: database, MYSQL_SSL: "false",
  });
  const { migrate } = await import("../db/migrate.mjs");
  await migrate({ log: () => {} });
  // Second run must be a no-op
  await migrate({ log: () => {} });
}
