'use strict';

const id = (Sequelize) => ({ type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true });
const fk = (Sequelize, table, { nullable = false, onDelete = 'CASCADE' } = {}) => ({
  type: Sequelize.INTEGER,
  allowNull: nullable,
  references: { model: table, key: 'id' },
  onDelete,
});
const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
});

module.exports = {
  async up(q, Sequelize) {
    await q.createTable('users', {
      id: id(Sequelize),
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      name: { type: Sequelize.STRING, allowNull: false },
      password_hash: { type: Sequelize.STRING, allowNull: false },
      ...timestamps(Sequelize),
    });

    // user_id NULL = built-in exercise visible to everyone; `key` lets the UI translate it
    await q.createTable('exercises', {
      id: id(Sequelize),
      user_id: fk(Sequelize, 'users', { nullable: true }),
      key: { type: Sequelize.STRING, unique: true },
      name: { type: Sequelize.STRING, allowNull: false },
      bodyweight: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(Sequelize),
    });

    await q.createTable('plans', {
      id: id(Sequelize),
      user_id: fk(Sequelize, 'users'),
      title: { type: Sequelize.STRING, allowNull: false },
      scheduled_for: { type: Sequelize.DATE, allowNull: false },
      ...timestamps(Sequelize),
    });

    await q.createTable('planned_sets', {
      id: id(Sequelize),
      plan_id: fk(Sequelize, 'plans'),
      exercise_id: fk(Sequelize, 'exercises', { onDelete: 'RESTRICT' }),
      position: { type: Sequelize.INTEGER, allowNull: false },
      reps: { type: Sequelize.INTEGER, allowNull: false },
      weight_kg: { type: Sequelize.FLOAT, allowNull: false },
      rest_sec: { type: Sequelize.INTEGER, allowNull: false },
    });

    await q.createTable('workouts', {
      id: id(Sequelize),
      user_id: fk(Sequelize, 'users'),
      plan_id: fk(Sequelize, 'plans', { nullable: true, onDelete: 'SET NULL' }),
      started_at: { type: Sequelize.DATE, allowNull: false },
      finished_at: { type: Sequelize.DATE, allowNull: false },
      ...timestamps(Sequelize),
    });

    await q.createTable('performed_sets', {
      id: id(Sequelize),
      workout_id: fk(Sequelize, 'workouts'),
      planned_set_id: fk(Sequelize, 'planned_sets', { nullable: true, onDelete: 'SET NULL' }),
      exercise_id: fk(Sequelize, 'exercises', { onDelete: 'RESTRICT' }),
      position: { type: Sequelize.INTEGER, allowNull: false },
      reps: { type: Sequelize.INTEGER, allowNull: false },
      weight_kg: { type: Sequelize.FLOAT, allowNull: false },
      rest_sec: { type: Sequelize.FLOAT },
      duration_sec: { type: Sequelize.FLOAT },
    });

    await q.addIndex('exercises', ['user_id']);
    await q.addIndex('plans', ['user_id', 'scheduled_for']);
    await q.addIndex('planned_sets', ['plan_id']);
    await q.addIndex('workouts', ['user_id', 'started_at']);
    await q.addIndex('workouts', ['plan_id']);
    await q.addIndex('performed_sets', ['workout_id']);

    await q.bulkInsert('exercises', [
      ['squat', 'Squat', false], ['bench', 'Bench press', false], ['deadlift', 'Deadlift', false],
      ['row', 'Barbell row', false], ['ohp', 'Overhead press', false], ['pullup', 'Pull-up', true],
    ].map(([key, name, bodyweight]) => ({ key, name, bodyweight })));
  },

  async down(q) {
    for (const t of ['performed_sets', 'workouts', 'planned_sets', 'plans', 'exercises', 'users']) {
      await q.dropTable(t);
    }
  },
};
