/**
 * The trained background-correction trees and their model card (D-038), as a separate entry
 * (`@envelope/models/background-models`): 3.7 MB of JSON that only the server loads.
 */
import type { BackgroundCard, BackgroundModel } from './background';
import card from './data/background-card.json';
import pm10 from './data/background-pm10.json';
import pm25 from './data/background-pm25.json';

export const BACKGROUND_MODELS = { pm10: pm10 as BackgroundModel, pm25: pm25 as BackgroundModel };
export const BACKGROUND_CARD = card as BackgroundCard;
