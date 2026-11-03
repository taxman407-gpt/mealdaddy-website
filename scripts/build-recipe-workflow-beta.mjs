// Run after `npm run build`. Produces only the private-beta artifact.
// This opt-in wrapper leaves the existing deployment command and live beta unchanged.
import './build-private-beta.mjs';
import {addRecipeWorkflowBeta} from './recipe-workflow-beta.mjs';
import {addFavoriteSearchBeta} from './favorite-search-beta.mjs';
addRecipeWorkflowBeta('dist-beta');
addFavoriteSearchBeta('dist-beta');
console.log('Prepared draft recipe/shopping workflow in dist-beta. No deployment performed.');
