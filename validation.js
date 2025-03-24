import Joi from 'joi';

export const gameDataSchema = Joi.object().pattern(
    Joi.string(), // Key is a channelId (string)
    Joi.object({
        channelId: Joi.string().required(),
        gmId: Joi.string().required(),
        players: Joi.object().pattern(Joi.string(), Joi.object({
            playerUsername: Joi.string().required(),
            consent: Joi.boolean().allow(null).required(),
            brink: Joi.string().allow('').required(),
            moment: Joi.string().allow('').required(),
            virtue: Joi.string().allow('').required(),
            vice: Joi.string().allow('').required(),
            stackOrder: Joi.array().items(Joi.string()).optional(),
            stackConfirmed: Joi.boolean().optional(),
            momentOnTop: Joi.boolean().optional(),
            name: Joi.string().allow('').required(),
            look: Joi.string().allow('').required(),
            concept: Joi.string().allow('').required(),
            recordings: Joi.string().allow('').required(),
            hopeDice: Joi.number().integer().min(0).required(),
            virtueBurned: Joi.boolean().required(),
            viceBurned: Joi.boolean().required(),
            momentBurned: Joi.boolean().required(),
            gear: Joi.array().items(Joi.string()).optional(),
            isDead: Joi.boolean().required(),
        })).required(),
        playerOrder: Joi.array().items(Joi.string()).required(),
        characterGenStep: Joi.number().integer().min(1).max(9).required(),
        traitsRequested: Joi.boolean().optional(),
        textChannelId: Joi.string().required(),
        guildId: Joi.string().required(),
        voiceChannelId: Joi.string().allow(null).required(),
        gameMode: Joi.string().valid('text-only', 'voice-plus-text').required(),
        initiatorId: Joi.string().required(),
        gm: Joi.object({
            consent: Joi.boolean().allow(null).required(),
            brink: Joi.string().allow('').required(),
        }).required(),
        lastSaved: Joi.string().isoDate().optional(),
        dicePool: Joi.number().integer().min(0).optional(),
        scene: Joi.number().integer().min(0).optional(),
        diceLost: Joi.number().integer().min(0).optional(),
        inLastStand: Joi.boolean().optional(),
        brinkResponses: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    })
);

export function validateGameData(data, schema) {
    const { error } = schema.validate(data);
    if (error) {
        console.error('Validation Error:', error.details.map(detail => detail.message).join(', '));
        return false;
    }
    return true;
}

export function validateGameSetup(message) {
    const gmMention = message.mentions.members.first();
    const gmId = gmMention.id;
    const playerIds = [...new Set(message.mentions.members.filter(member => member.id !== gmId).map(member => member.id))];

    if (!gmMention) {
        return { valid: false, reason: 'Please use @userid to mention the GM.' };
    }

    if (playerIds.length < 2) {
        return { valid: false, reason: 'Please mention at least two unique players.' };
    }

    if (playerIds.length !== message.mentions.members.filter(member => member.id !== gmId).size) {
        return { valid: false, reason: 'Please do not mention the same player more than once.' };
    }

    return { valid: true, gmId, playerIds };
}
