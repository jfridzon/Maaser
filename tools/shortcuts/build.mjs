// Builds two signed iPhone Shortcuts that log an entry straight into your private data repo.
//
//   MAASER_REPO=you/maaser-data MAASER_LANG=en node tools/shortcuts/build.mjs
//
// Needs a Mac signed in to iCloud. The files land in iCloud Drive/Shortcuts, next to
// maaser-token.txt, which the Shortcuts read at run time. The token never enters this repo.
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const OUT = join(homedir(), 'Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents');
const REPO = process.env.MAASER_REPO;
if (!/^[\w.-]+\/[\w.-]+$/.test(REPO || '')) { console.error('Set MAASER_REPO=owner/repo'); process.exit(1); }
const REPO_URL = `https://api.github.com/repos/${REPO}/contents/events/`;
const COPY = {
  en: { kinds: ['Salary', 'Gift', 'Transfer', 'Other'], what: 'What came in?', howMuch: 'How much came in?', gave: 'How much did you give?', who: 'To whom?', okIn: 'Income saved', okOut: 'Donation logged', fail: 'Not saved. Check your connection or token.', fileIn: 'Maaser income', fileOut: 'Maaser give' },
  es: { kinds: ['Sueldo', 'Regalo', 'Transferencia', 'Otro'], what: '¿Qué entró?', howMuch: '¿Cuánto entró?', gave: '¿Cuánto diste?', who: '¿A quién?', okIn: 'Ingreso guardado', okOut: 'Maaser registrado', fail: 'No se guardó. Revisa la conexión o el token.', fileIn: 'Maaser ingreso', fileOut: 'Maaser dar' },
};
const T = COPY[process.env.MAASER_LANG] || COPY.en;
const SLOT = '￼';
const id = () => randomUUID().toUpperCase();
const action = (name, params = {}) => ({ WFWorkflowActionIdentifier: `is.workflow.actions.${name}`, WFWorkflowActionParameters: params });
const output = (uuid, name) => ({ OutputUUID: uuid, Type: 'ActionOutput', OutputName: name });
const tokenRef = (uuid, name) => ({ Value: output(uuid, name), WFSerializationType: 'WFTextTokenAttachment' });

// text('a', ref, 'b') gives a Shortcuts text field with a variable between two strings.
function text(...parts) {
  let string = '';
  const attachmentsByRange = {};
  for (const p of parts) {
    if (typeof p === 'string') string += p;
    else { attachmentsByRange[`{${string.length}, 1}`] = p; string += SLOT; }
  }
  return { Value: { string, attachmentsByRange }, WFSerializationType: 'WFTextTokenString' };
}
const field = (key, value) => ({ WFItemType: 0, WFKey: text(key), WFValue: value });
const dict = items => ({ Value: { WFDictionaryFieldValueItems: items }, WFSerializationType: 'WFDictionaryFieldValue' });

function tail({ tokenId, nameParts, jsonParts, okText }) {
  const body = id(), encoded = id(), day = id(), stamp = id(), now = id(), res = id(), content = id(), flow = id();
  return [
    action('date', { UUID: now, WFDateActionMode: 'Current Date' }),
    action('format.date', { UUID: day, WFDateFormatStyle: 'Custom', WFDateFormat: 'yyyy-MM-dd', WFDate: text(output(now, 'Date')) }),
    action('format.date', { UUID: stamp, WFDateFormatStyle: 'Custom', WFDateFormat: 'yyyyMMddHHmmss', WFDate: text(output(now, 'Date')) }),
    action('gettext', { UUID: body, WFTextActionText: text(...jsonParts(output(day, 'Formatted Date'))) }),
    action('base64encode', { UUID: encoded, WFEncodeMode: 'Encode', WFBase64LineBreakMode: 'None', WFInput: tokenRef(body, 'Text') }),
    action('downloadurl', {
      UUID: res,
      WFURL: text(REPO_URL, 's', output(stamp, 'Formatted Date'), `-${nameParts}.json`),
      WFHTTPMethod: 'PUT',
      ShowHeaders: true,
      WFHTTPHeaders: dict([
        field('Authorization', text('Bearer ', output(tokenId, 'Text from Input'))),
        field('Accept', text('application/vnd.github+json')),
      ]),
      WFHTTPBodyType: 'JSON',
      WFJSONValues: dict([
        field('message', text(`atajo ${nameParts}`)),
        field('content', text(output(encoded, 'Base64 Encoded'))),
      ]),
    }),
    action('getvalueforkey', { UUID: content, WFGetDictionaryValueType: 'Value', WFDictionaryKey: 'content', WFInput: tokenRef(res, 'Contents of URL') }),
    action('conditional', { GroupingIdentifier: flow, WFControlFlowMode: 0, WFCondition: 100, WFInput: { Type: 'Variable', Variable: tokenRef(content, 'Dictionary Value') } }),
    action('notification', { WFNotificationActionTitle: 'Maaser', WFNotificationActionBody: okText, WFNotificationActionSound: false }),
    action('conditional', { GroupingIdentifier: flow, WFControlFlowMode: 1 }),
    action('notification', { WFNotificationActionTitle: 'Maaser', WFNotificationActionBody: T.fail, WFNotificationActionSound: true }),
    action('conditional', { GroupingIdentifier: flow, WFControlFlowMode: 2 }),
  ];
}

function readToken(token) {
  const file = id();
  return [
    action('documentpicker.open', { UUID: file, WFGetFilePath: 'maaser-token.txt', WFShowFilePicker: false, WFFileErrorIfNotFound: true }),
    action('detect.text', { UUID: token, WFInput: tokenRef(file, 'File') }),
  ];
}

function incomeShortcut() {
  const token = id(), menu = id(), choice = id(), amount = id();
  return [
    ...readToken(token),
    action('list', { UUID: menu, WFItems: T.kinds }),
    action('choosefromlist', { UUID: choice, WFChooseFromListActionPrompt: T.what, WFInput: tokenRef(menu, 'List') }),
    action('ask', { UUID: amount, WFAskActionPrompt: T.howMuch, WFInputType: 'Number' }),
    ...tail({
      tokenId: token, nameParts: 'income', okText: T.okIn,
      jsonParts: day => ['{"type":"income","kind":"', output(choice, 'Chosen Item'), '","amount":"', output(amount, 'Provided Input'), '","date":"', day, '"}'],
    }),
  ];
}

function givenShortcut() {
  const token = id(), amount = id(), to = id();
  return [
    ...readToken(token),
    action('ask', { UUID: amount, WFAskActionPrompt: T.gave, WFInputType: 'Number' }),
    action('ask', { UUID: to, WFAskActionPrompt: T.who, WFInputType: 'Text' }),
    ...tail({
      tokenId: token, nameParts: 'given', okText: T.okOut,
      jsonParts: day => ['{"type":"given","to":"', output(to, 'Provided Input'), '","amount":"', output(amount, 'Provided Input'), '","date":"', day, '"}'],
    }),
  ];
}

function build(file, actions, glyph) {
  const shortcut = {
    WFWorkflowMinimumClientVersion: 900, WFWorkflowMinimumClientVersionString: '900', WFWorkflowClientVersion: '2607.0.2',
    WFWorkflowIcon: { WFWorkflowIconStartColor: 431817727, WFWorkflowIconGlyphNumber: glyph },
    WFWorkflowImportQuestions: [],
    WFWorkflowTypes: [],
    WFWorkflowInputContentItemClasses: [], WFWorkflowOutputContentItemClasses: [],
    WFWorkflowHasShortcutInputVariables: false, WFWorkflowHasOutputFallback: false, WFQuickActionSurfaces: [],
    WFWorkflowActions: actions,
  };
  const dir = mkdtempSync(join(tmpdir(), 'atajo-'));
  const json = join(dir, 'a.json'), raw = join(dir, 'a.shortcut');
  writeFileSync(json, JSON.stringify(shortcut));
  execFileSync('plutil', ['-convert', 'binary1', json, '-o', raw]);
  execFileSync('shortcuts', ['sign', '--mode', 'anyone', '--input', raw, '--output', join(OUT, file)]);
  console.log('ok', file);
}

build(`${T.fileIn}.shortcut`, incomeShortcut(), 59446);
build(`${T.fileOut}.shortcut`, givenShortcut(), 59446);
