import { CATEGORY_KEYS, normalizeAnswer } from './answer-data.js';

const CATEGORIES = CATEGORY_KEYS;

export function calculateRoundScores(room, players, validationByPlayer) {
  const validAnswerCounts = Object.fromEntries(CATEGORIES.map(category => [category, new Map()]));
  for (const player of players) {
    for (const category of CATEGORIES) {
      const validation = validationByPlayer.get(player.id)?.[category];
      const answer = normalizeAnswer(player.answers[category]);
      if (answer && validation?.status === 'valid') {
        const counts = validAnswerCounts[category];
        counts.set(answer, (counts.get(answer) || 0) + 1);
      }
    }
  }
  return players.map(player => {
    const categoryPoints = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
    const answerCounts = Object.fromEntries(CATEGORIES.map(category => [category, validAnswerCounts[category].get(normalizeAnswer(player.answers[category])) || 0]));
    let roundPoints = 0;
    for (const category of CATEGORIES) {
      const answer = normalizeAnswer(player.answers[category]);
      const validation = validationByPlayer.get(player.id)?.[category];
      if (!answer || validation?.status !== 'valid') continue;
      let earned = validAnswerCounts[category].get(answer) === 1 ? 10 : 5;
      if (room.settings.mode === 'chaos' && room.bonusCategory === category) earned *= 2;
      categoryPoints[category] = earned;
      roundPoints += earned;
    }
    return { player, categoryPoints, answerCounts, roundPoints, validations: validationByPlayer.get(player.id) || {} };
  });
}

