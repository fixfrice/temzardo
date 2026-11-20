import { app } from './app';
import { sequelize } from './db';

const port = Number(process.env.PORT ?? 8000);

sequelize.authenticate().then(() => {
  app.listen(port, () => console.log(`TrainIQ API on :${port}`));
});
