import {cpSync,readFileSync,writeFileSync} from 'node:fs';
// Apply only to the private-beta artifact. Never alter the production artifact.
export function addRecipeWorkflowBeta(out='dist-beta') {
  for(const file of ['recipe-workflow.mjs','recipe-workflow-core.mjs','recipe-workflow.css']) cpSync(`app/${file}`,`${out}/app/${file}`);
  const file=`${out}/app/app.js`;
  let app=readFileSync(file,'utf8');
  const anchor='$("#plan-dinner").addEventListener("click", () => openCoachAction("dinner"));';
  if(app.includes('initRecipeWorkflow('))throw new Error('Recipe workflow already installed in this beta artifact.');
  if(app.split(anchor).length!==2)throw new Error('Recipe workflow integration anchor changed; review the integration rather than patching blindly.');
  const setup=`initRecipeWorkflow({
  userId:user.id,
  invoke:invokeMemberAi,
  favorites:()=>state.savedFoodsApi?.listRecipeFavorites?.() || [],
  navigate:showAppSubview,
  failure:readFunctionFailure,
  nutritionContext:()=>({
    calories:Math.round(state.currentTotals.calories),
    protein:Math.round(state.currentTotals.protein),
    totalCarbs:Math.round(state.currentTotals.carbs),
    netCarbs:Math.round(state.currentTotals.netCarbs),
    netCarbGoal:state.netCarbGoal || null,
    hydrationOunces:Math.round(state.currentTotals.water),
    hydrationGoalOunces:state.waterGoal,
    sodiumMg:state.currentTotals.sodium,
    sodiumGoalMg:state.sodiumGoal
  })
});\n`;
  app='import {initRecipeWorkflow} from "./recipe-workflow.mjs?v=20261102-1";\n'+app.replace(anchor,setup+anchor);
  writeFileSync(file,app);
}
