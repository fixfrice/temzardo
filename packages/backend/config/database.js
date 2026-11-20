const url = process.env.DATABASE_URL ?? 'postgres://trainiq:trainiq@localhost:5432/trainiq';
const env = { url, dialect: 'postgres', logging: false };

module.exports = { development: env, test: env, production: env };
