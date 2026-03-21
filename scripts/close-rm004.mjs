import { closeCycleHandler } from '../dist/tools/close-cycle.js';
const result = await closeCycleHandler({
  project_dir: 'C:/workspace/storycraft',
  roadmap_item: 'RM-004',
  dry_run: false,
  gates: []
});
console.log(result.content[0].text);
