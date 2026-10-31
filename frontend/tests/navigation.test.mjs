import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { register } from 'node:module';

// Vite loads stylesheet imports in the browser; DOM tests only exercise behavior.
register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, nextLoad) { if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return nextLoad(url, context); }")}`, import.meta.url);

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'CustomEvent', 'Event']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
HTMLElement.prototype.scrollIntoView = () => {};
const observers = [];
globalThis.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; this.elements = []; observers.push(this); }
  observe(element) { this.elements.push(element); }
  disconnect() {}
};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const { act, createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, useLocation, useNavigate } = await import('react-router-dom');
const { AppContent } = await import('../src/App.tsx');
const { default: AccountGate } = await import('../src/components/AccountGate.tsx');

let role;
let unreadFixture = false, readRequests = 0;
const tutorId = '65a000000000000000000001';
const studentId = '65a000000000000000000002';
const courseId = '65a000000000000000000003';
const course = { _id: courseId, tutorId, title: 'Álgebra para principiantes', description: 'Clases para aprender álgebra con ejercicios.', category: 'Matemáticas', modality: 'virtual', hourlyRate: 100, travelCost: 0 };
const tutor = { id: tutorId, fullName: 'Docente de prueba', tutorProfile: { biography: 'Docente para comprobar la navegación de tutorías.', specialties: ['Matemáticas'], hourlyRate: 100, teachingModalities: ['virtual'], credentials: [], professionalExperience: [], verificationStatus: 'verified' } };
globalThis.fetch = async (input, init = {}) => {
  const path = new URL(String(input), window.location.origin).pathname;
  let body = { data: [] }, status = 200;
  if (path === '/api/profiles/me' || path === '/api/auth/me') body = { user: { id: role === 'student' ? studentId : tutorId, fullName: 'Cuenta de prueba', email: 'test@example.invalid', accountStatus: 'active', role, onboardingCompleted: Boolean(role), ...(role === 'tutor' ? { tutorProfile: tutor.tutorProfile } : {}) } };
  else if (path === '/api/tutors') body = { data: [tutor], pagination: { page: 1, total: 1, totalPages: 1 } };
  else if (path === `/api/tutors/${tutorId}`) body = { data: tutor };
  else if (path.startsWith('/api/reviews/tutor/')) body = { data: [], totalPages: 0, averageRating: null, reviewCount: 0 };
  else if (path === '/api/services' || path === `/api/services/tutor/${tutorId}`) body = { data: [course], total: 1, totalPages: 1 };
  else if (path === '/api/admin/tutors') body = { data: [], total: 0, totalPages: 0 };
  else if (path === '/api/analytics') body = { month: '2026-10', statuses: [], demand: [], best: [], worst: [], users: [], openReports: 0, pendingAppeals: 0 };
  else if (path === '/api/chat' && init.method === 'POST') body = { data: { _id: 'conversation-1', peerId: tutorId, peerName: tutor.fullName, unread: 0 } };
  // No external socket connection during DOM tests; chat routing and conversation
  // selection still execute through the real components and mocked HTTP responses.
  else if (path === '/api/chat') { status = 503; body = { error: 'Conexión de pruebas desactivada.' }; }
  else if (path.includes('/messages')) body = { data: unreadFixture ? [{ _id: 'message-1', conversationId: 'conversation-1', senderId: tutorId, text: 'Mensaje sin leer', createdAt: '2026-10-30T12:00:00Z', readAt: null }] : [], hasMore: false };
  else if (path.endsWith('/read')) { readRequests++; body = { messages: [{ _id: 'message-1', readAt: '2026-10-30T13:00:00Z' }] }; }
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
};
function Probe() {
  const location = useLocation(), navigate = useNavigate();
  return h('div', { 'data-testid': 'probe' }, h('output', { 'data-testid': 'path' }, location.pathname + location.search), h('button', { 'data-testid': 'back', onClick: () => navigate(-1) }, 'Atrás'));
}
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); };
async function mount(path, accountRole) {
  role = accountRole === 'new' ? undefined : accountRole; window.sessionStorage.clear();
  if (accountRole) window.sessionStorage.setItem('edumatch_access_token', 'test-session');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(h(MemoryRouter, { initialEntries: [path] }, h(AppContent), h(Probe))); });
  await settle();
  return { container, async close() { await act(async () => root.unmount()); container.remove(); } };
}
async function click(element) { assert.ok(element, 'El control debe existir'); await act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); }); await settle(); }
const pathOf = (container) => container.querySelector('[data-testid="path"]').textContent;

test('home, tutor search and course catalog are separate pages with working history', async () => {
  const page = await mount('/');
  try {
    assert.ok(page.container.querySelector('.hero'));
    assert.equal(page.container.querySelector('.search-panel'), null);
    assert.equal(page.container.querySelector('#catalogo'), null);
    assert.equal(page.container.querySelector('#reservas'), null);
    await click(page.container.querySelector('nav a[href="/tutorias"]'));
    assert.equal(pathOf(page.container), '/tutorias');
    assert.ok(page.container.querySelector('.search-panel'));
    assert.equal(page.container.querySelector('.hero'), null);
    await click(page.container.querySelector('a[href="/tutorias/cursos"]'));
    assert.ok(page.container.querySelector('#catalogo'));
    assert.equal(page.container.querySelector('.search-panel'), null);
    await click(page.container.querySelector('[data-testid="back"]'));
    assert.equal(pathOf(page.container), '/tutorias');
    assert.ok(page.container.querySelector('.search-panel'));
  } finally { await page.close(); }
});
test('private direct URLs request login and student accounts cannot open administration', async () => {
  const anonymous = await mount('/calendario');
  try { assert.match(anonymous.container.textContent, /Inicia sesión para continuar/); assert.equal(anonymous.container.querySelector('#reservas'), null); } finally { await anonymous.close(); }
  const student = await mount('/administracion/estadisticas', 'student');
  try { assert.match(student.container.textContent, /Esta sección corresponde a otro perfil/); assert.equal(student.container.querySelector('.moderation-panel'), null); } finally { await student.close(); }
});
test('administrator pages show only the selected workspace section', async () => {
  const page = await mount('/administracion/estadisticas', 'admin');
  try {
    assert.ok(page.container.querySelector('.analytics-bars'));
    assert.doesNotMatch(page.container.textContent, /Usuarios e historial/);
    await click(page.container.querySelector('a[href="/administracion/categorias"]'));
    assert.match(page.container.textContent, /Crear categoría/);
    assert.equal(page.container.querySelector('.analytics-bars'), null);
    await click(page.container.querySelector('a[href="/administracion/catedraticos"]'));
    assert.ok(page.container.querySelector('.admin-panel'));
    assert.equal(page.container.querySelector('.moderation-panel'), null);
  } finally { await page.close(); }
});
test('a course reservation opens its course in the calendar; shared profiles close on history navigation', async () => {
  const page = await mount('/tutorias', 'student');
  try {
    await click([...page.container.querySelectorAll('button')].find((button) => button.textContent.includes('Ver perfil')));
    assert.match(pathOf(page.container), /tutor=/);
    assert.ok(page.container.querySelector('[role="dialog"]'));
    await click(page.container.querySelector('[data-testid="back"]'));
    assert.equal(page.container.querySelector('[role="dialog"]'), null);
    await click([...page.container.querySelectorAll('button')].find((button) => button.textContent.includes('Ver perfil')));
    await click([...page.container.querySelectorAll('button')].find((button) => button.textContent === 'Reservar sesión'));
    assert.equal(pathOf(page.container), '/calendario');
    assert.equal(page.container.querySelector('.schedule-tutor select').value, courseId);
    assert.equal(page.container.querySelector('[role="dialog"]'), null);
  } finally { await page.close(); }
});
test('sending a message from a shared tutor profile opens the messages page and conversation', async () => {
  const page = await mount(`/tutorias?tutor=${tutorId}`, 'student');
  try {
    await click([...page.container.querySelectorAll('button')].find((button) => button.textContent === 'Enviar mensaje'));
    assert.equal(pathOf(page.container), '/mensajes');
    assert.equal(page.container.querySelector('#mensajes').parentElement.hidden, false);
    assert.equal(page.container.querySelector('.chat-thread h3').textContent, tutor.fullName);
    await click(page.container.querySelector('nav a[href="/tutorias"]'));
    assert.equal(page.container.querySelector('#mensajes').parentElement.hidden, true);
  } finally { await page.close(); }
});
test('a chat kept connected in another page does not mark hidden messages as read', async () => {
  unreadFixture = true; readRequests = 0;
  const focus = document.hasFocus; document.hasFocus = () => true;
  const bounds = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = () => ({ top: 10, bottom: 40 });
  const page = await mount(`/tutorias?tutor=${tutorId}`, 'student');
  try {
    await click([...page.container.querySelectorAll('button')].find((button) => button.textContent === 'Enviar mensaje'));
    const oldObserver = observers.findLast((observer) => observer.elements.some((element) => element.dataset.messageId === 'message-1'));
    assert.ok(oldObserver);
    await click(page.container.querySelector('nav a[href="/tutorias"]'));
    await act(async () => oldObserver.callback(oldObserver.elements.map((target) => ({ isIntersecting: true, target }))));
    assert.equal(readRequests, 0);
    await click(page.container.querySelector('nav a[href="/mensajes"]'));
    const visibleObserver = observers.findLast((observer) => observer.elements.some((element) => element.dataset.messageId === 'message-1'));
    await act(async () => visibleObserver.callback(visibleObserver.elements.map((target) => ({ isIntersecting: true, target }))));
    assert.equal(readRequests, 1);
  } finally { await page.close(); unreadFixture = false; document.hasFocus = focus; HTMLElement.prototype.getBoundingClientRect = bounds; }
});
test('a new user must choose a role and receives the required personal fields and map', async () => {
  const page = await mount('/perfil', 'new');
  try {
    assert.match(page.container.textContent, /Soy estudiante/);
    assert.equal(page.container.querySelector('.profile-map'), null);
    await click([...page.container.querySelectorAll('button')].find((button) => button.textContent === 'Soy estudiante'));
    assert.ok(page.container.querySelector('input[type="tel"][required]'));
    assert.ok(page.container.querySelector('.profile-map.leaflet-container'));
    assert.match(page.container.textContent, /Número de documento/);
    assert.match(page.container.textContent, /Categorías de interés/);
    assert.match(page.container.textContent, /Dirección habitual obligatoria/);
  } finally { await page.close(); }
});
test('an expired JWT clears the session and redirects to the login page', async () => {
  role = 'student';
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 1 })).toString('base64url');
  window.sessionStorage.setItem('edumatch_access_token', `header.${payload}.signature`);
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => { root.render(h(MemoryRouter, { initialEntries: ['/calendario'] }, h(AccountGate, null, h(AppContent)), h(Probe))); });
    await settle();
    assert.equal(pathOf(container), '/acceso?motivo=sesion');
    assert.equal(window.sessionStorage.getItem('edumatch_access_token'), null);
    assert.match(container.textContent, /Tu sesión venció/);
    assert.equal(container.querySelector('#reservas'), null);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
