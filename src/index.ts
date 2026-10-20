export { normalizar, type OpcionesNormalizacion } from "./normalizar.js";
export { buscarCita, subcadenaMasCercana, type ResultadoCita } from "./citas.js";
export { extraerCifras, cifraPresente, calzan, lecturas, type Cifra, type TipoCifra } from "./cifras.js";
export {
  verificarLink,
  esDireccionPrivada,
  type EstadoLink,
  type ResultadoLink,
  type OpcionesLinks,
  type Resolver,
} from "./links.js";
export { leerDocumento, ErrorDocumento, type Documento, type Afirmacion, type ReferenciaFuente } from "./documento.js";
export {
  verificarDocumento,
  type Informe,
  type Hallazgo,
  type CodigoHallazgo,
  type Severidad,
  type Veredicto,
  type ResultadoAfirmacion,
  type OpcionesVerificacion,
} from "./verificar.js";
export { cargarFuentes, textoDeHtml } from "./fuentes.js";
export { formatearInforme } from "./formato.js";
