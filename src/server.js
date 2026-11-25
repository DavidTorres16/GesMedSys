const { createApp, createServices } = require('./app');
const { seed } = require('./seed');

async function main() {
  const jwtSecret = process.env.JWT_SECRET;
  const adminPassword = process.env.SEED_PASSWORD;
  if (!jwtSecret || !adminPassword) {
    console.error('Defina las variables JWT_SECRET y SEED_PASSWORD');
    process.exit(1);
  }
  const services = createServices({ jwtSecret });
  await seed(services, { adminPassword });

  const port = Number(process.env.PORT ?? 8080);
  createApp(services).listen(port, () => {
    console.log(`GesMedSys escuchando en el puerto ${port}`);
  });
}

main();
