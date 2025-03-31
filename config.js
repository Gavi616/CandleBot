export const CONSENT_TIMEOUT = 60000;
export const SACRIFICE_TIMEOUT = 60000;
export const BRINK_TIMEOUT = 60000;

export const reminders = [120000, 300000, 600000];

export const TEST_USER_ID = '583340515869589522';

export const languageOptions = {
  'en-US': {
    name: 'English (US)',
    voices: {
      'en-US-Standard-A': { name: 'Standard A', ssmlGender: 'FEMALE' },
      'en-US-Standard-B': { name: 'Standard B', ssmlGender: 'MALE' },
      'en-US-Standard-C': { name: 'Standard C', ssmlGender: 'FEMALE' },
      'en-US-Standard-D': { name: 'Standard D', ssmlGender: 'MALE' },
      'en-US-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'en-US-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
      'en-US-Neural2-C': { name: 'Neural2 C', ssmlGender: 'FEMALE' },
      'en-US-Neural2-D': { name: 'Neural2 D', ssmlGender: 'MALE' },
      'en-US-Neural2-E': { name: 'Neural2 E', ssmlGender: 'FEMALE' },
      'en-US-Neural2-F': { name: 'Neural2 F', ssmlGender: 'MALE' },
      'en-US-Neural2-G': { name: 'Neural2 G', ssmlGender: 'FEMALE' },
      'en-US-Neural2-H': { name: 'Neural2 H', ssmlGender: 'MALE' },
      'en-US-Neural2-I': { name: 'Neural2 I', ssmlGender: 'FEMALE' },
      'en-US-Neural2-J': { name: 'Neural2 J', ssmlGender: 'MALE' },
    },
  },
  'en-GB': {
    name: 'English (GB)',
    voices: {
      'en-GB-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'en-GB-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
      'en-GB-Neural2-C': { name: 'Neural2 C', ssmlGender: 'FEMALE' },
      'en-GB-Neural2-D': { name: 'Neural2 D', ssmlGender: 'MALE' },
      'en-GB-Neural2-F': { name: 'Neural2 F', ssmlGender: 'FEMALE' },
    },
  },
  'es-ES': {
    name: 'Spanish (ES)',
    voices: {
      'es-ES-Standard-A': { name: 'Standard A', ssmlGender: 'FEMALE' },
      'es-ES-Standard-B': { name: 'Standard B', ssmlGender: 'MALE' },
      'es-ES-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'es-ES-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
    },
  },
  'fr-FR': {
    name: 'French (FR)',
    voices: {
      'fr-FR-Standard-A': { name: 'Standard A', ssmlGender: 'FEMALE' },
      'fr-FR-Standard-B': { name: 'Standard B', ssmlGender: 'MALE' },
      'fr-FR-Standard-C': { name: 'Standard C', ssmlGender: 'FEMALE' },
      'fr-FR-Standard-D': { name: 'Standard D', ssmlGender: 'MALE' },
      'fr-FR-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'fr-FR-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
      'fr-FR-Neural2-C': { name: 'Neural2 C', ssmlGender: 'FEMALE' },
      'fr-FR-Neural2-D': { name: 'Neural2 D', ssmlGender: 'MALE' },
    },
  },
  'de-DE': {
    name: 'German (DE)',
    voices: {
      'de-DE-Standard-A': { name: 'Standard A', ssmlGender: 'FEMALE' },
      'de-DE-Standard-B': { name: 'Standard B', ssmlGender: 'MALE' },
      'de-DE-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'de-DE-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
    },
  },
  // Add additional languages here...
};

export const defaultVirtues = [
  'courageous', 'compassionate', 'just', 'wise', 'temperate', 'hopeful', 'faithful', 'loving', 'loyal', 'honest',
  'generous', 'patient', 'diligent', 'forgiving', 'kind', 'optimistic', 'reliable', 'respectful', 'selfless', 'sincere',
  'tolerant', 'trustworthy', 'understanding', 'vigilant', 'witty', 'adaptable', 'ambitious', 'charitable', 'creative', 'decisive'
];

export const defaultVices = [
  'greedy', 'wrathful', 'envious', 'slothful', 'proud', 'gluttonous', 'lustful', 'treacherous', 'deceitful', 'cowardly',
  'jealous', 'malicious', 'pessimistic', 'reckless', 'resentful', 'rude', 'selfish', 'stubborn', 'suspicious', 'vain',
  'vengeful', 'wasteful', 'withdrawn', 'arrogant', 'bitter', 'careless', 'cruel', 'dishonest', 'frivolous', 'hateful'
];

export const defaultMoments = [
  "find a way to signal for help.",
  "locate a safe place to rest.",
  "protect a vulnerable person.",
  "discover the source of the strange noises.",
  "retrieve a lost item of importance.",
  "find a way to communicate with the outside world.",
  "repair a broken piece of equipment.",
  "find a hidden cache of supplies.",
  "escape from a dangerous location.",
  "provide light in the darkness to help a friend."
];

export const defaultPlayerGMBrinks = [
  "desperately searching for a way out, their eyes wide with panic.",
  "clinging to a flickering candle, their face illuminated by its dying light.",
  "whispering a prayer, their voice trembling with fear.",
  "huddled in a corner, their body shaking uncontrollably.",
  "frantically trying to barricade a door, their movements clumsy and rushed.",
  "stumbling through the darkness, their breath coming in ragged gasps.",
  "clutching a makeshift weapon, their knuckles white with tension.",
  "staring into the abyss, their expression a mask of terror.",
  "crying out for help, their voice hoarse and desperate.",
  "scrambling away from something unseen, their eyes darting wildly."
];

export const defaultThreatBrinks = [
  "moving just beyond the edge of the light, always out of focus.",
  "leaving behind a trail of unnatural coldness.",
  ", their eyes glowing with an unnatural light.",
  ", their eyes glowing with an unnatural light.",
  "moving too quick to follow, a blur in the periphery.",
  ", their shadows stretching and distorting in impossible ways.",
  "the temperature in the room plummeting whenever they are near.",
  "the sound of their breathing, ragged and wet, just out of earshot.",
  "a feeling of being watched, even when no one is there.",
  "the lights flickering and dimming in their presence.",
  "a low, guttural humming that vibrates through the floor.",
  "their touch leaving behind a residue that feels strangely slick.",
  "the scent of ozone and burnt sugar lingering after they've gone.",
  "their reflections not quite matching their physical form.",
  "and felt a sense of wrongness, like the fabric of reality is fraying around them.",
  "as small objects around the room began to float and drift.",
  ", the static on any electronic device intensifying when they are close.",
  ", their laughter, a high-pitched and chilling sound, echoing from nowhere.",
  "their skin looking pale and stretched, like it's about to tear.",
  " with a faint, metallic tang in the air, like blood but not quite.",
  " as the patterns on the walls seemed to writhe and shift.",
  "as a profound sense of dread washed over me."
];

export const newGameMessage = `**The World of Ten Candles**\nYour characters will face unimaginable terrors in the dying of the light.\n\n**Though you know your characters will die, you must have hope that they will survive.**\n\n**Ten Candles** focuses around shared narrative control.\nEveryone will share the mantle of storyteller and have an equal hand in telling this dark story.\n\nLet\'s begin character generation. Check your DMs for instructions.\n\n`;

export const stepOneMessage = `**Step One: Players Write Traits**\nPlayers, check your DMs and reply with a Virtue and a Vice.`;

export const stepTwoMessage = '**Step Two: GM Introduces this session\'s Module / Theme**\nThe GM will now introduce the module/theme and then use `.theme [description]` to advance to Step Three';

export const stepThreeMessage = `**Step Three: Players Create Concepts**\nPlayers, expect a DM and respond with your character\'s Name, Look and Concept, in that order as three separate messages.`;

export const stepFourMessage = `**Step Four: Players Plan Moments**\nMoments are an event that would be reasonable to achieve, kept succinct and clear to provide strong direction. However, all Moments should have potential for failure.`;

export const stepFiveMessage = `**Step Five: Players and GM Discover Brinks**\nCheck your DMs for personalized instructions on this step.`;

export const stepSixMessage = '**Step Six: Arrange Trait Stacks**\nPlayers should now arrange their Traits, Moment, and Brink cards. Your Brink must go on the bottom of the stack, face down. See your DMs to confirm your stack order.';

export const stepSevenMessage = '**Step Seven: Inventory Supplies**\nYour character has whatever items you have in your pockets (or follow your GM\'s instructions, if provided). See your DMs to input your gear.';

export const stepSevenReminder = '**It begins.**\n\n*For the remainder of the session, you should endeavor to act in-character.*';

export const stepEightMessage = '**Final Recordings**\nPlayers, please check your DMs for instructions on sending your final recordings.';

export const gameStartMessage = '**Game Start**\nCharacter generation is complete! Ten candles are lit, and the game begins.\n\n**How to Use `.conflict`:**\nUse the `.conflict` command to perform actions. Use modifiers such as `-burnvirtue`, `-burnvice` and `-burnmoment` as needed.\nBuring a Virtue or Vice from the top of your stack allows your `.conflict` to reroll all ones.\nBuring your Moment from the top of your stack will give you a valuable Hope die if the `.conflict` succeeds!\nExample(s): `.conflict` or `.conflict -burnvice`\n\nCandles will be extinguished as the scenes progress.';

export const startingMessageGM = `**Ten Candles Game Mechanics**
Resolving a Conflict: Players use \`.conflict\` to roll a communal dice pool. If at least one die lands on 6 the conflict is successful. Any dice that come up 1 are removed until the scene ends. A candle is darkened if no 6s appear on a conflict roll (after any appropriate Traits are burned).
Burning Traits: A player may burn a Trait to reroll all dice which come up 1 in a conflict.
Moment: If a player lives their Moment successfully, they gain a Hope Die to add to their conflict rolls.
Hope Die: A Hope Die succeeds on a 5 or a 6.
Brink: After all else has burned away, whenever a player embraces their Brink, they reroll all dice. If the conflict roll still fails, they lose their Hope die (if they had one).
Dire Conflicts: You may decide that a particular conflict roll will be dire. The player may either withdraw their action or press onward. If they press onward a success is handled normally, but a failure may result in permanent damage to the character (mental or physical).
Narration Rights: If the player rolled more 6’s than you (the GM), that player may describe what happens as a result of the conflict. Keep the narration simple, reasonable, and interesting. Remember: you aren’t playing to win, but to tell a good story. If you (the GM) tied the player's roll or rolled more 6’s than the player, you (the GM) may describe what happens as a result of the conflict. A player who fails a conflict roll may take over narration at any time, the cost is their character's life.
Darkening Candles: Whenever a candle is darkened for any reason, the current scene ends and Changing Scenes events happen before a new scene begins. Once darkened, candles may never be relit. When no lit candles remain, the game enters The Last Stand.
Changing Scenes: Any time a candle darkens and a new scene begins, three events occur.
Transition: You (the GM) transition the players out of the failed conflict roll and scene. This should be brief so as not to close off too many player avenues.
Establishing Truths:
These things are true. The world is dark.
Establish # truths equal to lit candles.
Truths are irrefutable facts pertaining to a single change in the story. (e.g. "Billy began convulsing on the floor and then suddenly stopped"; "Our flashlights illuminated the water, but there were no waves."; or "We filled the pickup’s tank by mouth-siphoning gas from cars on the highway").
After the last truth everyone left alive speaks, “and we are alive.”
Dice Pools Refresh: The Players’ pool of dice refills to the number of lit candles. The GM’s pool equals the number of unlit candles.`;;

export const startingMessagePlayer = `**Ten Candles Game Mechanics**
Resolving a Conflict: Use \`.conflict\` after you have declared the action you'd like to take to roll the communal dice pool. If at least one die lands on 6 the conflict is successful. Any dice that come up 1 are removed until the scene ends. A candle is darkened if no 6s appear on a conflict roll (after any appropriate Traits are burned).
Burning Traits: A trait can be burned in order to reroll all dice which come up 1 in a conflict.
Moment: If you live your Moment successfully, gain a Hope Die to add to your conflict rolls.
Hope Die: A Hope Die succeeds on a 5 or a 6.
Brink: After all else has burned away, whenever you embrace your Brink, reroll all dice. If the conflict roll still fails, you lose your Hope die (if you had one).
Dire Conflicts: The GM may decide that a particular conflict roll will be dire. If they do so, you may either withdraw their action or press onward. If you press onward a success is handled normally, but a failure may result in permanent damage to your character (mental or physical).
Narration Rights: If you rolled more 6’s than the GM, you may describe what happens as a result of the conflict. Keep the narration simple, reasonable, and interesting. Remember: you aren’t playing to win, but to tell a good story. If the GM tied your roll or rolled more 6’s, the GM may describe what happens as a result of the conflict. If you fail a conflict roll, you may take over narration at any time, but the cost is your character's life.
Darkening Candles: Whenever a candle is darkened for any reason, the current scene ends and Changing Scenes events happen before a new scene begins. Once darkened, candles may never be relit. When no lit candles remain, the game enters The Last Stand.
Changing Scenes: Any time a candle darkens and a new scene begins, three events occur.
Transition: The GM transitions out of the failed conflict roll and scene. This should be brief so as not to close off too many player avenues.
Establishing Truths:
These things are true. The world is dark.
Establish # truths equal to lit candles.
Truths are irrefutable facts pertaining to a single change in the story. (e.g. "Billy began convulsing on the floor and then suddenly stopped.", "Our flashlights illuminated the water, but there were no waves." or "We filled the pickup’s tank by mouth-siphoning gas from cars on the highway".
After the last truth everyone left alive speaks, “and we are alive.”
Dice Pools Refresh: The Players’ pool of dice refills to the number of lit candles. The Players’ pool of dice refills to the number of lit candles. The GM’s pool equals the number of unlit candles.`;

export const finalRecordingsMessage = 'The final scene fades to black. The story is over. Your final recordings will play after a moment of silence.';
