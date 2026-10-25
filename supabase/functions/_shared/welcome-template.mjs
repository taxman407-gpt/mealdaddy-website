export const DEFAULT_WELCOME_TEMPLATE = {
 subject: "Welcome to MealDaddy™ — Let's Get Started!",
 body: "Welcome to MealDaddy! We're glad you're here.\n\nComplete your profile, log your first meal (description or photo), explore your nutrition and hydration dashboard, and save favorite foods.\n\nSign in: {{signInUrl}}\n\nMealDaddy Team.\nGeneral wellness guidance; not medical advice."
};
export function validateWelcomeTemplate(template) {
 if (!template || typeof template.subject !== 'string' || typeof template.body !== 'string') throw new Error('Subject and message are required.');
 const subject=template.subject.trim(), body=template.body.trim();
 if (!subject || subject.length>160 || /[\r\n\x00-\x1f\x7f]/.test(subject)) throw new Error('Use a single-line subject of 1–160 characters.');
 if (!body || body.length>10000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body)) throw new Error('Use a message of 1–10,000 characters.');
 if (!body.includes('{{signInUrl}}')) throw new Error('Keep {{signInUrl}} in the message so members can sign in.');
 if (/{{|}}/.test(body.replaceAll('{{signInUrl}}',''))) throw new Error('Only the {{signInUrl}} placeholder is supported.');
 return {subject,body};
}
export function renderWelcomeTemplate(template,signInUrl) {
 const checked=validateWelcomeTemplate(template);
 return {subject:checked.subject,text:checked.body.replaceAll('{{signInUrl}}',signInUrl)};
}
