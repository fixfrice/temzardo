import {
  CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes,
  Model, NonAttribute, Sequelize,
} from 'sequelize';

export const sequelize = new Sequelize(
  process.env.DATABASE_URL ?? 'postgres://trainiq:trainiq@localhost:5432/trainiq',
  { logging: false, define: { underscored: true } },
);

type Attrs<M extends Model> = InferAttributes<M>;
type Create<M extends Model> = InferCreationAttributes<M>;

export class User extends Model<Attrs<User>, Create<User>> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare name: string;
  declare passwordHash: string;
}

export class Exercise extends Model<Attrs<Exercise>, Create<Exercise>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<number> | null;
  declare key: CreationOptional<string | null>;
  declare name: string;
  declare bodyweight: CreationOptional<boolean>;
}

export class PlannedSet extends Model<Attrs<PlannedSet>, Create<PlannedSet>> {
  declare id: CreationOptional<number>;
  declare planId: ForeignKey<number>;
  declare exerciseId: number;
  declare position: number;
  declare reps: number;
  declare weightKg: number;
  declare restSec: number;
}

export class Plan extends Model<Attrs<Plan>, Create<Plan>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare title: string;
  declare scheduledFor: Date;
  declare sets?: NonAttribute<PlannedSet[]>;
}

export class PerformedSet extends Model<Attrs<PerformedSet>, Create<PerformedSet>> {
  declare id: CreationOptional<number>;
  declare workoutId: ForeignKey<number>;
  declare plannedSetId: number | null;
  declare exerciseId: number;
  declare position: number;
  declare reps: number;
  declare weightKg: number;
  declare restSec: number | null;
  declare durationSec: number | null;
}

export class Workout extends Model<Attrs<Workout>, Create<Workout>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare planId: number | null;
  declare startedAt: Date;
  declare finishedAt: Date;
  declare sets?: NonAttribute<PerformedSet[]>;
}

// Factories, not shared objects: Sequelize mutates attribute definitions (it writes `field` into them).
const pk = () => ({ type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true });
const required = (type: DataTypes.DataType) => () => ({ type, allowNull: false });
const int = required(DataTypes.INTEGER);
const float = required(DataTypes.FLOAT);
const str = required(DataTypes.STRING);
const date = required(DataTypes.DATE);

User.init({ id: pk(), email: str(), name: str(), passwordHash: str() }, { sequelize, tableName: 'users' });
Exercise.init(
  { id: pk(), key: DataTypes.STRING, name: str(), bodyweight: { type: DataTypes.BOOLEAN, defaultValue: false } },
  { sequelize, tableName: 'exercises' },
);
Plan.init({ id: pk(), userId: int(), title: str(), scheduledFor: date() }, { sequelize, tableName: 'plans' });
PlannedSet.init(
  { id: pk(), exerciseId: int(), position: int(), reps: int(), weightKg: float(), restSec: int() },
  { sequelize, tableName: 'planned_sets', timestamps: false },
);
Workout.init(
  { id: pk(), userId: int(), planId: DataTypes.INTEGER, startedAt: date(), finishedAt: date() },
  { sequelize, tableName: 'workouts' },
);
PerformedSet.init(
  {
    id: pk(), plannedSetId: DataTypes.INTEGER, exerciseId: int(), position: int(), reps: int(),
    weightKg: float(), restSec: DataTypes.FLOAT, durationSec: DataTypes.FLOAT,
  },
  { sequelize, tableName: 'performed_sets', timestamps: false },
);

Exercise.belongsTo(User, { foreignKey: 'userId' });
Plan.hasMany(PlannedSet, { as: 'sets', foreignKey: 'planId', onDelete: 'CASCADE' });
Workout.hasMany(PerformedSet, { as: 'sets', foreignKey: 'workoutId', onDelete: 'CASCADE' });
Workout.belongsTo(Plan, { foreignKey: 'planId' });
