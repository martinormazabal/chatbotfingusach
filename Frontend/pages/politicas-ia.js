import Link from 'next/link';
import styles from './politicas-ia.module.css';

const PRINCIPLES = [
  {
    title: 'Uso responsable',
    description:
      'El asistente se limita a contenidos institucionales verificados y registra cada fuente consultada.',
  },
  {
    title: 'Privacidad y seguridad',
    description:
      'Las conversaciones se tratan como información sensible. No se almacenan credenciales ni datos personales.',
  },
  {
    title: 'Supervisión humana',
    description:
      'Siempre debe existir una persona responsable capaz de validar, corregir o escalar las respuestas generadas.',
  },
  {
    title: 'Prevención de sesgos',
    description:
      'Se revisan los datos de entrenamiento para evitar recomendaciones discriminatorias o inconsistentes.',
  },
];

const HEURISTICS = [
  'Visibilidad del estado: se detallan los escenarios permitidos y prohibidos.',
  'Control del usuario: enlaces claros para volver al panel principal o abrir el chatbot.',
  'Consistencia: estructura compartida con el resto del frontend y tipografía uniforme.',
  'Prevención de errores: se enumeran ejemplos concretos de uso no autorizado.',
];

export default function PoliticasIA() {
  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/" legacyBehavior>
          <a className={styles.backLink}>← Panel principal</a>
        </Link>
        <p className={styles.breadcrumb}>Asistente Virtual · Políticas de uso</p>
        <h1>Políticas de uso de IA</h1>
        <p>
          Este prototipo sigue lineamientos que resguardan la transparencia y el resguardo documental de USACH.
          Revísalos antes de habilitar el chatbot para nuevas audiencias.
        </p>
        <div className={styles.heuristics}>
          <h2>Heurísticas aplicadas</h2>
          <ul>
            {HEURISTICS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </aside>

      <main className={styles.main}>
        <section className={styles.cardGrid}>
          {PRINCIPLES.map((principle) => (
            <article key={principle.title} className={styles.card}>
              <h3>{principle.title}</h3>
              <p>{principle.description}</p>
            </article>
          ))}
        </section>

        <section className={styles.warning}>
          <h2>Escenarios prohibidos</h2>
          <ul>
            <li>Compartir transcripciones del chat con personas externas a la universidad.</li>
            <li>Solicitar contraseñas, datos sensibles o antecedentes disciplinarios.</li>
            <li>Utilizar el asistente para emitir sanciones sin revisión humana.</li>
          </ul>
          <p>
            Ante dudas contacta a la unidad jurídica o desactiva temporalmente el módulo hasta realizar una revisión.
          </p>
        </section>

        <section className={styles.actions}>
          <Link href="/chatbot" legacyBehavior>
            <a className={styles.primaryButton}>Ir al asistente</a>
          </Link>
          <Link href="/" legacyBehavior>
            <a className={styles.secondaryButton}>Volver al panel</a>
          </Link>
        </section>
      </main>
    </div>
  );
}