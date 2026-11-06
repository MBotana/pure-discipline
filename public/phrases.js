// Frases del juego. Se elige una por situación y por fecha (siempre la misma el mismo día).
const P = {
  inicio: [
    'Nadie viene a salvarte. Levantate.',
    'Hoy se gana en silencio.',
    'La disciplina es hacerlo cuando no tenés ganas.',
    'Un día más. Un ladrillo más.',
    'No necesitás motivación. Necesitás empezar.',
    'Lo que hagas hoy lo cobra el que sos mañana.',
    'Sin público. Sin excusas. Solo el trabajo.',
    'Cada tarea chica es un voto por quien querés ser.',
    'El cansancio miente. Seguí.',
    'Poco, pero todos los días.',
    'Hacelo mal, pero hacelo.',
    'La constancia es la única magia.',
    'Hoy no tenés que ser perfecto. Tenés que aparecer.',
    'Lo difícil es empezar. Después es inercia.',
    'Sombra y hierro. Eso es todo lo que hace falta.'
  ],
  bueno: [
    'Día cumplido. Eso nadie te lo quita.',
    'Otro día en el banco. Seguí así.',
    'Así se construye un nombre: callado y a diario.',
    'Hoy ganaste. Mañana, otra vez.',
    'Eso es disciplina. Ni más ni menos.',
    'La sombra se hace más fuerte.',
    'Un día más que el yo de ayer no tuvo.'
  ],
  parcial: [
    'No fue perfecto. Fue algo, y algo suma.',
    'Un día a medias sigue siendo un día en pie.',
    'Mañana se corrige. Hoy ya está hecho.',
    'Lo importante es no cortar la cadena.'
  ],
  malo: [
    'Un mal día no es una mala vida. Volvé mañana.',
    'Caer no cuenta. Quedarse en el piso, sí.',
    'Hoy no salió. Mañana tiene 24 horas nuevas.',
    'Que un día falle no borra los que hiciste.'
  ],
  nivel: [
    'Subiste. Se nota en lo que cargás.',
    'Más fuerte que ayer. Eso alcanza.',
    'Nivel nuevo. La sombra crece.',
    'Cada nivel es una promesa cumplida.'
  ],
  titulo: [
    'Un título nuevo. No te lo regalaron: lo ganaste.',
    'Ahora te llaman distinto. Que sea merecido.',
    'Título desbloqueado. Seguí subiendo.'
  ],
  vuelta: [
    'Volviste. Eso es lo que cuenta.',
    'Pasó el tiempo. Empezá de nuevo, sin culpa.',
    'No hay que recuperar nada. Solo hacer hoy.'
  ],
  descarga: [
    'Semana de descarga: bajá un cambio, pero no pares.',
    'Descansar también es entrenar. Hoy, liviano.',
    'El cuerpo crece cuando descansa. Aprovechá.'
  ],
  racha: [
    'La racha no se rompe sola: se cuida.',
    'Semana tras semana. Así se hace un hábito.',
    'La mascota te mira. No la defraudes.'
  ]
};

const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Frase de una situación para una fecha (determinista). */
export function frase(tipo, fecha) {
  const l = P[tipo] || P.inicio;
  return l[hash(tipo + fecha) % l.length];
}
