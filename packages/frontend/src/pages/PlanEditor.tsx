import { DeleteOutlined, ExperimentOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { api } from '@/lib/api';
import { fmtDuration, useExercises } from '@/lib/hooks';

type Block = { exerciseId: number; sets: number; reps: number; weightKg: number; restSec: number };
type Values = { title: string; scheduledFor: Dayjs; blocks: Block[] };

export default function PlanEditor() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { exercises, label } = useExercises();
  const [form] = Form.useForm<Values>();
  const [hints, setHints] = useState<Record<number, string>>({});
  const blocks = Form.useWatch('blocks', form) ?? [];

  const save = useMutation({
    mutationFn: ({ title, scheduledFor, blocks }: Values) =>
      api.createPlan({
        title,
        scheduledFor: scheduledFor.toISOString(),
        sets: blocks.flatMap(({ sets, ...set }) => Array(sets).fill(set)),
      }),
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      navigate(`/plans/${plan.id}`, { replace: true });
    },
    onError: (e) => message.error(e.message),
  });

  /** Ask the model for the heaviest weight at which it expects every set to hit the target reps. */
  const suggest = async (i: number) => {
    const b: Block = form.getFieldValue(['blocks', i]);
    const at: Dayjs = form.getFieldValue('scheduledFor');
    const r = await api.recommend(b.exerciseId, { sets: b.sets, reps: b.reps, rest_sec: b.restSec, at: at.toISOString() });
    if (r.weight_kg == null) return setHints((h) => ({ ...h, [i]: t('editor.noHistory') }));
    form.setFieldValue(['blocks', i, 'weightKg'], r.weight_kg);
    setHints((h) => ({ ...h, [i]: t('editor.hint', { weight: r.weight_kg, reps: r.predicted_reps.map((x) => x.toFixed(1)).join(' / ') }) }));
  };

  const estimate = blocks.reduce((sum, b) => sum + (b?.sets ?? 0) * ((b?.reps ?? 0) * 3 + (b?.restSec ?? 0)), 0);

  return (
    <Form<Values>
      form={form}
      layout="vertical"
      onFinish={save.mutate}
      initialValues={{ title: t('editor.defaultTitle'), scheduledFor: dayjs().add(1, 'day').hour(19).minute(0), blocks: [] }}
    >
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Form.Item name="title" label={t('editor.title')} rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="scheduledFor" label={t('editor.when')} rules={[{ required: true }]}>
          <DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="D MMM YYYY, HH:mm" className="w-full" />
        </Form.Item>
      </div>

      <Form.List name="blocks">
        {(fields, { add, remove }) => (
          <div className="flex flex-col gap-3">
            {fields.map(({ key, name }) => (
              <Card key={key} size="small"
                title={
                  <Form.Item name={[name, 'exerciseId']} noStyle>
                    <Select variant="borderless" className="min-w-48" options={exercises.map((e) => ({ value: e.id, label: label(e) }))} />
                  </Form.Item>
                }
                extra={<Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />}
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3">
                  <Form.Item name={[name, 'sets']} label={t('editor.sets')}><InputNumber min={1} max={10} className="w-full" /></Form.Item>
                  <Form.Item name={[name, 'reps']} label={t('editor.reps')}><InputNumber min={1} max={50} className="w-full" /></Form.Item>
                  <Form.Item name={[name, 'weightKg']} label={t('editor.weight')}><InputNumber min={0} step={2.5} className="w-full" /></Form.Item>
                  <Form.Item name={[name, 'restSec']} label={t('editor.rest')}><InputNumber min={0} step={15} className="w-full" suffix="s" /></Form.Item>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="small" icon={<ExperimentOutlined />} onClick={() => suggest(name)}>{t('editor.suggest')}</Button>
                  {hints[name] && <span className="text-gray-500 text-sm">{hints[name]}</span>}
                </div>
              </Card>
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              disabled={!exercises.length}
              onClick={() => add({ exerciseId: exercises[0]?.id, sets: 3, reps: 8, weightKg: 40, restSec: 120 })}
            >
              {t('editor.addExercise')}
            </Button>
          </div>
        )}
      </Form.List>

      <div className="flex items-center justify-between mt-4">
        <span className="text-gray-500">{blocks.length > 0 && t('editor.estimate', { time: fmtDuration(estimate) })}</span>
        <Button type="primary" htmlType="submit" loading={save.isPending} disabled={!blocks.length}>{t('editor.save')}</Button>
      </div>
    </Form>
  );
}
