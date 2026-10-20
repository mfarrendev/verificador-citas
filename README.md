# verificador-citas

Juez determinista para texto generado por IA. Recibe un documento con
afirmaciones, cada una con su cita textual y sus fuentes, y comprueba sin
ningún modelo de lenguaje:

- que la cita aparezca literalmente en la fuente, y si no aparece, cuál es
  el fragmento de la fuente más parecido;
- que cada cifra de la afirmación (porcentajes, montos en USD o CLP, años,
  números en formato chileno o inglés) esté en la cita o en la fuente;
- que los links existan, separando el link caído del que no se pudo
  comprobar.

El resultado es un veredicto por afirmación y uno global. Nada se aprueba
por omisión: una afirmación sin cita o sin fuente es bloqueante.

## El problema

Un modelo de lenguaje que resume fuentes produce texto que se ve citado
aunque no lo esté. Los errores típicos son pequeños y difíciles de ver a
ojo: una cita "casi" literal con una cifra cambiada, un porcentaje que no
está en ninguna parte, un link a una página que nunca existió. Revisarlos a
mano es lento; pedirle a otro modelo que los revise repite el problema.

Este paquete hace la parte mecánica de esa revisión, la que tiene una
respuesta exacta, para que la persona que revisa gaste su tiempo en lo que
sí requiere criterio.

## Instalación

Requiere Node 24.

```bash
git clone <este repositorio>
cd verificador-citas
npm install
npm run build
```

## Uso por línea de comandos

```bash
npx verificador-citas documento.json --fuentes carpeta/
```

| Opción | Efecto |
| --- | --- |
| `--fuentes <carpeta>` | textos de las fuentes (`.txt`, `.md`, `.html`, `.csv`, recursivo) |
| `--json` | informe en JSON en vez de texto |
| `--sin-red` | no consulta links; cada URL queda como aviso |
| `--timeout <ms>` | tiempo máximo por link (10000 por omisión) |
| `--ignorar-tildes` | "politica" calza con "política" |
| `--distinguir-mayusculas` | por omisión se ignoran |
| `--estricto` | los avisos también hacen fallar la salida |

Código de salida: 0 si se aprueba (con o sin avisos), 1 si se rechaza, 2
ante un error de uso o una entrada mal formada. Sirve para cortar un flujo
de CI o un pipeline de generación.

## Ejemplo

La carpeta `ejemplo/` trae un documento con cinco afirmaciones y dos fuentes
ficticias. El documento tiene esta forma:

```json
{
  "titulo": "Resumen generado: movilidad urbana",
  "afirmaciones": [
    {
      "id": "bicicleta",
      "texto": "El uso de bicicleta se triplicó, del 2,1% al 6,3%.",
      "cita": "El uso de bicicleta pasó del 2,1% al 6,3% en el mismo período.",
      "fuentes": ["encuesta-movilidad"]
    },
    {
      "id": "metodologia",
      "texto": "La metodología sigue el estándar internacional de encuestas origen-destino.",
      "cita": "metodología estándar de encuestas origen-destino",
      "fuentes": [{ "archivo": "encuesta-movilidad", "url": "https://example.com/" }]
    }
  ]
}
```

Una fuente puede ser el nombre de un archivo de la carpeta (con o sin
extensión), una URL, o un objeto con las dos cosas. La URL se consulta para
saber si el link está vivo; el texto contra el que se compara la cita sale
siempre del archivo local.

Salida real de `node dist/cli.js ejemplo/documento.json --fuentes ejemplo/fuentes`:

```
Resumen generado: movilidad urbana

[ok] transporte-publico
     aviso       cifra-fuera-de-cita: la cifra "2025" está en la fuente pero no en la cita
[NO] bicicleta
     bloqueante  cita-no-encontrada: la cita no aparece literalmente en ninguna de sus fuentes
       más cercano en la fuente: "el uso de bicicleta pasó del 2,1% al 4,7% en el mismo período."
       distancia 2, similitud 0.97
     aviso       cifra-fuera-de-cita: la cifra "2,1%" está en la fuente pero no en la cita
     bloqueante  cifra-sin-respaldo: la cifra "6,3%" no aparece ni en la cita ni en la fuente
[ok] ciclovias
     aviso       cifra-fuera-de-cita: la cifra "18" está en la fuente pero no en la cita
[NO] gasto-hogares
     bloqueante  sin-cita: la afirmación no trae cita textual
     bloqueante  sin-fuente: la afirmación no declara ninguna fuente
     bloqueante  cifra-sin-respaldo: la cifra "$86.400" no aparece ni en la cita ni en la fuente
[NO] metodologia
     bloqueante  cita-no-encontrada: la cita no aparece literalmente en ninguna de sus fuentes
       nada parecido en las fuentes (similitud 0.42)

RECHAZADO: 2 de 5 afirmaciones aprobadas, 6 bloqueantes, 3 avisos
```

La afirmación `bicicleta` es el caso que motivó el proyecto: la cita se ve
bien, pero la fuente dice 4,7% y no 6,3%. El verificador muestra la frase
real con distancia 2 y, como la cita no se encontró, no le permite respaldar
la cifra inventada.

## Uso como librería

```ts
import { cargarFuentes, leerDocumento, verificarDocumento } from "verificador-citas";

const doc = leerDocumento(JSON.parse(texto)); // lanza ErrorDocumento si la forma no sirve
const informe = await verificarDocumento(doc, {
  fuentes: await cargarFuentes("fuentes/"), // o un objeto { nombre: texto }
  ignorarTildes: false,
  links: { timeoutMs: 5000 },
});

informe.veredicto; // "aprobado" | "aprobado-con-avisos" | "rechazado"
```

Las piezas también se exportan por separado: `buscarCita`,
`extraerCifras`, `cifraPresente`, `verificarLink`, `normalizar`.

`verificarLink` acepta un `fetch` y un `resolver` de DNS inyectables, que es
como se prueban todos los casos de red sin salir a internet:

```ts
const r = await verificarLink("https://ejemplo.org/x", {
  fetch: miFetchFalso,
  resolver: async () => ["93.184.216.34"],
  timeoutMs: 2000,
});
r.estado; // "link-vivo" | "link-caido" | "link-no-verificable"
```

## Hallazgos

| Código | Severidad | Cuándo |
| --- | --- | --- |
| `sin-cita` | bloqueante | la afirmación no trae cita |
| `sin-fuente` | bloqueante | no declara fuentes |
| `texto-vacio` | bloqueante | la afirmación no tiene texto |
| `documento-vacio` | bloqueante | no hay afirmaciones |
| `fuente-desconocida` | bloqueante | el archivo nombrado no está en la carpeta |
| `cita-sin-texto-de-fuente` | bloqueante | ninguna fuente tiene texto local para comparar |
| `cita-no-encontrada` | bloqueante | la cita no está en ninguna de sus fuentes |
| `cifra-sin-respaldo` | bloqueante | la cifra no está ni en la cita ni en la fuente |
| `link-caido` | bloqueante | 404, 410, dominio inexistente o URL mal formada |
| `cifra-fuera-de-cita` | aviso | la cifra está en la fuente pero no en la cita |
| `link-no-verificable` | aviso | timeout, 403, 429, 5xx, destino privado o red desactivada |

## Decisiones de diseño

**Determinista antes que modelo.** Saber si una frase está en un texto, o
si un número aparece en él, tiene respuesta exacta. Resolverlo con un
modelo agrega costo, latencia y, sobre todo, la misma clase de error que se
quiere atrapar. Un juez basado en modelo tiene sentido para preguntas de
interpretación ("¿esta cita respalda esta afirmación?"), y debería correr
después de este, sobre lo que ya pasó el filtro mecánico.

**Distinguir caído de no verificable.** Un 404 es evidencia de que el
recurso no existe; un 403 o un timeout solo dicen que no se pudo mirar.
Muchas fuentes serias (revistas, bases de patentes, sitios de gobierno)
bloquean a los robots. Tratar eso como link caído llenaría el informe de
falsos positivos y enseñaría a ignorarlo. Por eso el primero bloquea y el
segundo avisa.

**Nada se aprueba por omisión.** Si falta la cita, falta la fuente o la
fuente no tiene texto contra el cual comparar, la afirmación no pasa. Una
verificación que no se pudo hacer no cuenta como verificación hecha.

**Normalizar lo tipográfico y nada más.** Se unifican comillas curvas,
guiones largos, espacios, caracteres invisibles y palabras cortadas por un
salto de línea de PDF. Las mayúsculas se ignoran por omisión y las tildes
solo si se pide. Cualquier otra diferencia, por chica que sea, rompe la
coincidencia: es justamente lo que se busca detectar.

**Las cifras guardan todas sus lecturas.** "1.234" es mil doscientos
treinta y cuatro en Chile y uno coma dos en inglés. En vez de adivinar el
formato, cada cifra se compara con todas sus lecturas posibles, incluidos
multiplicadores como "millones" o "mil millones". Así "USD 3,2 millones"
calza con "3.200.000 dólares", pero "12,5%" nunca calza con "15,2%".

**Una cita que no se encontró no respalda nada.** Si la cita no está en la
fuente, sus cifras tampoco cuentan como respaldo; se buscan directamente
en la fuente.

**Protección SSRF básica.** Antes de cada pedido, incluido cada salto de
una redirección, se resuelve el dominio y se rechaza cualquier destino en
loopback, redes privadas, enlace local (incluida la IP de metadatos de las
nubes), CGNAT o multicast. Las redirecciones se siguen a mano, nunca de
forma automática.

## Limitaciones

- La cita se busca de forma literal. Una paráfrasis fiel se reporta como
  `cita-no-encontrada`; decidir si una paráfrasis es fiel requiere criterio
  y queda fuera de este paquete.
- No descarga el texto de las URL: la cita se compara contra archivos
  locales. Para fuentes web hay que guardar antes el texto.
- No lee PDF ni Word. Hay que convertirlos a texto primero, y la calidad de
  esa conversión limita la de la verificación.
- La extracción de cifras usa expresiones regulares. Reconoce los formatos
  comunes en español e inglés, pero no números escritos con palabras
  ("tres millones") ni rangos como "10-12%" como una unidad. Los números
  pegados a letras (`ISO9001`) se ignoran a propósito.
- Con una sola ocurrencia de separador seguida de tres dígitos ("1.234") la
  cifra es ambigua y se aceptan las dos lecturas. Eso puede dejar pasar un
  error de mil veces en ese caso puntual.
- Que una cifra aparezca en la fuente no prueba que se use con el mismo
  sentido: "4,3%" puede estar en otra frase. El aviso
  `cifra-fuera-de-cita` existe para que alguien lo mire.
- La protección SSRF resuelve el DNS y luego `fetch` resuelve de nuevo, así
  que no cubre un ataque de DNS rebinding. Para fuentes no confiables
  conviene correrlo en una red sin acceso a servicios internos.
- La búsqueda aproximada es cuadrática. En fuentes muy grandes se limita a
  la ventana que comparte más palabras con la cita, y el fragmento cercano
  puede no ser el óptimo.
- Se pregunta primero con `HEAD` y, ante 404, 405, 410 o 501, se confirma
  con `GET`. Un servidor que responde 200 a una página que ya no existe (un
  "404 blando") se informa como vivo: el estado HTTP es lo único que se mira.

## Desarrollo

```bash
npm test          # vitest
npm run typecheck # tsc estricto sobre src y pruebas
npm run build     # compila a dist/
```

Las pruebas de red usan un `fetch` y un DNS falsos; ninguna sale a internet.

## Licencia

MIT. Ver `LICENSE`.
