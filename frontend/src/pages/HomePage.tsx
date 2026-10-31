import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import CategoryCard from '../components/CategoryCard';
import Icon from '../components/Icon';

const categories = [
  { name: 'Matemáticas', icon: 'math' as const, count: 'Lógica y números' },
  { name: 'Idiomas', icon: 'language' as const, count: 'Aprende a comunicarte' },
  { name: 'Programación', icon: 'code' as const, count: 'Crea algo nuevo' },
  { name: 'Ciencias', icon: 'science' as const, count: 'Explora el porqué' },
  { name: 'Apoyo escolar', icon: 'school' as const, count: 'Avanza con confianza' },
  { name: 'Preparación para exámenes', icon: 'exam' as const, count: 'Llega mejor preparado' },
];

export default function HomePage({ children, onCategory, onTeach }: { children: ReactNode; onCategory: (name: string) => void; onTeach: () => void }) {
  return <>

      <section className="hero" id="inicio">
        <div className="container hero__grid">
          <div className="hero__content">
            <span className="eyebrow"><span className="eyebrow__dot" /> APRENDER A TU MANERA</span>
            <h1>El próximo paso empieza con <span>la persona indicada.</span></h1>
            <p className="hero__copy">Conecta con tutores que entienden tus metas. Encuentra apoyo para aprender algo nuevo, reforzar una materia o prepararte para lo que sigue.</p>
            <div className="hero__proof"><span className="proof-avatars" aria-hidden="true"><i>LM</i><i>AC</i><i>SH</i></span><span>Tu aprendizaje, con guía cercana</span></div>
          </div>
          <div className="hero-art" aria-label="Ilustración decorativa de una sesión de aprendizaje">
            <div className="hero-art__sun" /><div className="hero-art__spark hero-art__spark--one">✳</div><div className="hero-art__spark hero-art__spark--two">✦</div>
            <div className="lesson-card">
              <div className="lesson-card__top"><span className="lesson-card__label">TU ESPACIO DE APRENDIZAJE</span><span className="lesson-card__dots">•••</span></div>
              <div className="lesson-card__title">Una meta a la vez.</div><div className="lesson-progress"><span /></div>
              <div className="lesson-card__bottom"><span>Progreso de hoy</span><strong>75%</strong></div>
              <div className="lesson-avatar" aria-hidden="true"><span>¡Hola!</span><b>✦</b></div>
            </div>
            <div className="floating-note floating-note--rating"><span className="floating-note__icon"><Icon name="star" /></span><span><strong>Aprendizaje con propósito</strong><small>A tu ritmo y tus objetivos</small></span></div>
            <div className="floating-note floating-note--session"><span className="floating-note__icon floating-note__icon--green"><Icon name="check" /></span><span><strong>Una buena conexión</strong><small>puede cambiarlo todo</small></span></div><div className="hero-art__base" />
          </div>
        </div>
        <div className="container home-actions"><Link className="button" to="/tutorias">Buscar tutorías <Icon name="arrow" /></Link></div>
      </section>      <section className="section categories-section" id="categorias" aria-labelledby="categories-title">
        <div className="container">
          <div className="section-heading section-heading--row"><div><span className="eyebrow">UN MUNDO POR APRENDER</span><h2 id="categories-title">¿Qué te gustaría <span>explorar?</span></h2></div><p>Hay muchas formas de crecer. Encuentra el tema que enciende tu curiosidad.</p></div>
          <div className="category-grid">{categories.map((category) => <CategoryCard key={category.name} {...category} onSelect={onCategory} />)}</div>
        </div>
      </section>

{children}

      <section className="how-section" id="como-funciona" aria-labelledby="how-title">
        <div className="container how-grid">
          <div className="how-intro"><span className="eyebrow eyebrow--light">SENCILLO DESDE EL INICIO</span><h2 id="how-title">Aprender mejor empieza por <span>conectar.</span></h2><p>EduMatch busca hacer más sencillo el encuentro entre estudiantes con ganas de aprender y tutores con ganas de enseñar.</p><Link className="button button--light" to="/tutorias">Explorar tutorías <Icon name="arrow" /></Link></div>
          <div className="steps-list">
            <article className="step"><span className="step__number">01</span><div><h3>Cuéntanos qué buscas</h3><p>Elige una materia, un objetivo y la modalidad que te acomoda.</p></div><Icon name="search" /></article>
            <article className="step"><span className="step__number">02</span><div><h3>Encuentra tu afinidad</h3><p>Explora perfiles de tutores y conoce su enfoque de enseñanza.</p></div><Icon name="users" /></article>
            <article className="step"><span className="step__number">03</span><div><h3>Da el siguiente paso</h3><p>Reserva una sesión, coordina por chat y sigue tus clases desde tu calendario.</p></div><Icon name="arrow" /></article>
          </div>
        </div>
      </section>

      <section className="tutor-cta" id="acceso">
        <div className="container tutor-cta__inner"><div><span className="eyebrow">¿QUIERES COMPARTIR LO QUE SABES?</span><h2>Tu experiencia también puede <span>inspirar.</span></h2><p>Estamos construyendo un espacio donde enseñar y aprender se encuentran.</p></div><button className="button" type="button" onClick={onTeach}>Quiero enseñar <Icon name="arrow" /></button></div>
      </section>

  </>;
}
