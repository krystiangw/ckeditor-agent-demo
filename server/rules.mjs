const DISCLOSURE_MARKER = 'If you believe any part of this decision is in error';
const DISCLOSURE_HTML = `<p>${DISCLOSURE_MARKER}, please contact us with any additional information so we can review your claim promptly.</p>`;

const complianceLexicon = [
  {
    find: 'we guarantee',
    replacement: 'we expect',
    ruleId: 'COMP-03',
    reason: 'Absolute commitments are forbidden in claim correspondence.',
  },
  {
    find: 'no fault of ours',
    replacement: 'our review indicates',
    ruleId: 'COMP-02',
    reason: 'Fault language must be neutral and evidence-based.',
  },
  {
    find: 'final and non-negotiable',
    replacement: 'our current assessment',
    ruleId: 'COMP-03',
    reason: 'Claimants must not be told that a reviewable decision is absolute.',
  },
];

const plainLanguageLexicon = [
  ['subrogation', 'recovery from the responsible party'],
  ['indemnification', 'compensation'],
  ['pursuant to', 'under'],
];

function decodeEntities(value) {
  const entities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  return value.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}

function plainText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function uniqueMatches(text, expression) {
  return [...new Set(Array.from(text.matchAll(expression), (match) => match[0]))];
}

export function buildPlan(html, mode) {
  const text = plainText(html);
  const lowerText = text.toLowerCase();

  if (mode === 'compliance') {
    const plan = [];
    if (!lowerText.includes(DISCLOSURE_MARKER.toLowerCase())) {
      plan.push({
        kind: 'insertParagraphBefore',
        anchor: 'Sincerely',
        html: DISCLOSURE_HTML,
        ruleId: 'COMP-01',
        reason: 'Mandatory fraud disclosure missing.',
      });
    }

    for (const rule of complianceLexicon) {
      if (lowerText.includes(rule.find.toLowerCase())) plan.push({ kind: 'replace', ...rule });
    }
    return plan;
  }

  if (mode === 'pii') {
    const findings = [
      ...uniqueMatches(text, /PL-\d{6}/gi),
      ...uniqueMatches(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
      ...uniqueMatches(text, /\b\d{3}-\d{2}-\d{4}\b/g),
    ];
    return findings.map((find) => ({
      kind: 'replace',
      find,
      replacement: '[REDACTED]',
      ruleId: 'PII-01',
      reason: 'Personally identifiable information must be removed before sharing.',
    }));
  }

  if (mode === 'plain') {
    return plainLanguageLexicon
      .filter(([find]) => lowerText.includes(find))
      .map(([find, replacement]) => ({
        kind: 'replace',
        find,
        replacement,
        ruleId: 'PLAIN-01',
        reason: 'Use clear language that claimants can understand.',
      }));
  }

  throw new Error(`Unknown review mode: ${mode}`);
}
