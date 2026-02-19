const Joi = require("joi");

exports.createContentSchema = Joi.object({
  title: Joi.string().min(3).max(150).required().messages({
    "string.min": "O título deve ter no mínimo 3 caracteres.",
    "any.required": "O título é obrigatório."
  }),
  description: Joi.string().max(1000).allow("").optional(),
  isPremium: Joi.boolean().required(),
  section: Joi.string().valid("HQCINE", "VCINE", "HIQUA").required(),
  type: Joi.string().valid("video", "webtoon").required()
});