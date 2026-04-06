import { validateTaskDecomposition } from '../decomposition/decomposition-validator.js';
import { LLMDecomposer, type AutomationIssue } from '../decomposition/llm-decomposer.js';
import { createOmegaPlanningLayer } from '../omega/understanding.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const issue: AutomationIssue = {
    number: 182,
    title: '[chore] スケール耐性評価: 100万件/月の入札公告処理に向けた基盤確認',
    labels: ['🤖agent-execute', '🎯 phase:planning'],
    body: `
## 要件
- [ ] 現行パイプライン（公告取得 → PDF取得 → OCR → 判定）の各ステップについて、上記スケールに対するスループット上限を評価する
- [ ] ボトルネックとなる箇所を特定し、段階的な拡張パスを示す
- [ ] 30分SLAを満たすために必要なインフラ・アーキテクチャ変更の方針を整理する
- [ ] 定期ポーリング → リアルタイムkickへの拡張パスが確保されているか確認する

## 制約
- 実装ではなく評価・設計方針のドキュメント化が主成果物
`.trim(),
  };

  const planning = createOmegaPlanningLayer(issue, { dryRun: true });
  assert(
    JSON.stringify(planning.intent.preferredCapabilities) === JSON.stringify(['analysis']),
    `analysis-only issue should stay in analysis capability, got ${planning.intent.preferredCapabilities.join(', ')}`,
  );
  assert(
    planning.strategicPlan.deliverableFocus.includes('assessment/design report'),
    'analysis-only issue should produce assessment/design artifacts, not implementation artifacts.',
  );

  const decomposition = await new LLMDecomposer().decomposeIssue(issue);
  const validated = validateTaskDecomposition(decomposition);
  assert(validated.valid, `decomposition should stay valid: ${validated.errors.join('; ')}`);
  assert(validated.tasks.length === 4, `analysis-only issue should keep its 4 planning tasks, got ${validated.tasks.length}`);
  assert(
    validated.tasks.every((task) => task.agent === 'IssueAgent' && task.type === 'analysis'),
    'analysis-only planning tasks should map to IssueAgent analysis work without synthetic execution handoffs.',
  );
  assert(
    !validated.warnings.some((warning) => warning.includes('synthetic')),
    'analysis-only issue should not receive synthetic Test/Review/PR handoffs.',
  );

  console.log('[passed] analysis-only-planning');
  console.log(`  - capabilities=${planning.intent.preferredCapabilities.join(',')}`);
  console.log(`  - tasks=${validated.tasks.length}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
