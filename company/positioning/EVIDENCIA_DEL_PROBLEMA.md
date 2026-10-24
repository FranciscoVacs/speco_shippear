# Evidencia externa del problema: la verificación formal ya escala, la spec no

Fuentes de afuera que validan el problema que Speco ataca. Sirven para el pitch y las preguntas duras **como validación del problema**, nunca como capacidad de Speco (ver `AFIRMACIONES.md` → «Intención verificada»).
Recopilado el 2026-10-24. Las citas son textuales (en inglés) y van con su fuente; la traducción es nuestra.

## La idea en una línea

**Probar que el código cumple una spec ya se automatiza a escala con IA. Lo que no se automatiza es saber si la spec es la correcta.** Ese es el tramo (A) de `docs/37` §3: `intención aprobada → regla formal → código`. Los verificadores cierran el segundo; el primero sigue siendo de una persona. Ahí está Speco.

---

## 1. Anthropic (Frontier Red Team) + Theorem: verificación formal en más de 100 librerías

> **Fuente primaria.** Es la referencia de cabecera para narrativas y marco teórico sobre verificación e intención (`docs/16` §6 bis, `docs/37` §6.1). Las demás fuentes de este archivo la complementan.

**Fuente:** Anthropic, *«LLMs are making formal software verification feasible at a much larger scale»*, 22 de octubre de 2026. <https://www.anthropic.com/research/formal-verification>
Tweet de Anthropic anunciándolo: «New on our Frontier Red Team blog: using Claude to formally verify software at large scale. […] In collaboration with @theoremlabs, we used Claude to prove security properties in over one hundred real-world open-source libraries over the span of a few weeks.» <https://x.com/AnthropicAI/status/2113390212911083894> (22-oct-2026; verificado el 2026-10-24).

**Qué hicieron (hechos del post):**
- 123 librerías de OSS-Fuzz, 239 puntos de entrada probados libres de crashes, en «unas pocas semanas».
- La propiedad: ningún input de hasta 64 MB hace crashear el binario (RISC-V, Linux, un hilo, memoria acotada). Probado sobre el ensamblador, no sobre el código fuente, y chequeado por Rocq.
- ~180 millones de líneas de prueba en Rocq; una prueba típica ronda las 600.000 líneas. Nadie las lee: las revisa una máquina.
- Encontraron y parcharon «cientos» de bugs (sin cifra exacta).
- Un intérprete de Python en Rust verificado con Verus: 99,95 % de comportamiento idéntico a CPython en 1,7 millones de programas aleatorios.

**Las citas que sostienen nuestro problema:**

| Cita textual | Qué valida para Speco |
|---|---|
| Resumen del post: «Most software is riddled with bugs, which AI can now easily find and exploit. The standard defenses against cyberattacks are no longer sufficient: we need ways to prove that code is free of bugs. Formal software verification could provide this guarantee, but it has historically required years of expert effort, making it impractical for most real-world projects.» | El contexto: encontrar fallas ya es barato para la IA (y para el atacante), así que hace falta **probar**. Habla de seguridad, no de reglas de negocio: se usa como apertura, no como prueba de nuestro problema |
| «To prove that a piece of software is correct, we must first state what "correct" even means. Correctness is defined by the specification (spec). In some programs, there is a clear way to formally specify the program's intended behavior.» | **El puente al problema de Speco:** no se puede probar nada sin decir antes qué es «correcto». Su ejemplo de spec clara es un decodificador de PNG (sigue el RFC 2083). La inferencia es nuestra, no del post: en una regla de negocio («revisión manual arriba de 10.000») no hay RFC; lo «correcto» lo decide una persona |
| «The difficulty of obtaining a comprehensive and unambiguous spec is a significant obstacle to verifying software at a larger scale.» | El cuello de botella ya no es probar: es tener una spec **completa y no ambigua**. Eso es literalmente lo que revisan `COV` y `QUA` |
| «However, a proof checker can't tell you whether your spec matches reality.» | El tramo (A) de `docs/37` §3. Una prueba verde sobre la spec equivocada es la peor combinación |
| «"Formally verified" does not mean "bug-free."» / «This doesn't mean these libraries contain no bugs.» | Probaron que no crashea, no que haga lo que el negocio decidió. «No crashea» es una propiedad genérica: no necesita a nadie de producto. «El umbral de fraude es 10.000» sí |
| Nota 6: «Claude could make any theorem provable by rewriting the program into one that trivially never crashes.» | Mismo patrón que `EXPERIMENTO_RETRABAJO.md`: si nadie fija qué se quería, el agente encuentra la forma de «cumplir» decidiendo solo. Tuvieron que penalizar y auditar los parches. Speco cubre la versión de esto con tests: si un agente edita el test que verifica una regla, la verificación deja de contar (spec 032) |
| Lo que hay que confiar incluye «the theorem statements» (los enunciados) | Aunque «virtualmente nada» de la prueba se revisa a mano, **lo que se prueba** sí. Esa revisión humana del enunciado es la que Speco hace en idioma de negocio |
| Pronóstico: la verificación formal «will soon be as practical as fuzzing is today for almost all production software.» | El «por qué ahora»: si probar se vuelve barato, la escasez se muda a decidir qué probar |

## 2. Theorem: OSS Verify

**Fuente:** <https://theorem.dev/oss-verify>. Tweet de Theorem (@theoremlabs): «We formally verified 123 open-source projects in a partnership with Anthropic. Formal verification at scale is here! Now we're launching OSS Verify to scale it to the software we all depend on. We prove it's crash-free or send you the patches it needs. Free for open-source.» Publicado el 22-oct-2026 en <https://x.com/theoremlabs> (perfil y texto confirmados por búsqueda el 2026-10-24; no tenemos el link directo al post: mostrar el perfil o una captura).

**Hechos:**
- Programa gratis para proyectos open source. Prueban sobre el binario compilado que «no input up to 64 MiB can cause a crash, either by violating a fuzz test or triggering ASan». Chequeado por el kernel de Rocq.
- **La spec es el fuzz test:** no hay otro lenguaje de especificación. Vos escribís un test que «crashea por la razón correcta», y eso se prueba.
- Los hallazgos y parches los genera la IA: «we don't promise that a person reviews them before we send them.»

**Qué valida:** el formato de spec que escala hoy es uno que **no expresa intención de negocio** (un fuzz test dice «no rompas», no «cobrá 2 % arriba de 5.000»). Y el circuito ya funciona sin una persona en el medio: decidir qué se prueba es justo lo que queda afuera.

## 3. crosscheck (nicholls-inc)

**Fuente:** <https://github.com/nicholls-inc/crosscheck> y su visión, `docs/VISION.md`. Repo público, plugin de Claude Code; autor individual no identificado (solo la organización). Tracción mínima (1 estrella al 2026-10-24): se cita como señal de dirección, no de mercado.

**Qué es:** un plugin que verifica código generado por IA con Dafny y Lean, testing diferencial contra modelos en Lean, y `cgv`, un verificador de contratos para Python (Django, dataclasses) con pruebas de correctitud en Lean.

**Citas de su visión (textuales):**

| Cita | Qué valida para Speco |
|---|---|
| «We want a way to know that AI-generated code is correct without trusting an AI to say so.» | El mismo dolor, del lado del código |
| «LLMs propose. Deterministic checks and humans decide.» | Es casi palabra por palabra nuestro principio (`D-009`, `D-012`; `docs/16`). Otro equipo llegó solo a la misma regla |
| «Every claim traces up to a requirement that a person approved.» | La cadena hasta un requisito **aprobado por una persona** es lo que Speco ya tiene: aprobaciones con hash encadenado |
| «Those contracts do not yet trace to requirements.» | Reconocen que el eslabón requisito → contrato les falta. Es el eslabón que Speco cubre |
| Las dos uniones que solo se sostienen con observación y juicio experto: los supuestos sobre el mundo y si los requisitos logran el objetivo (resumen de su visión) | Coincide con `G-*` → `FR-*` en `product/goals.md`: si el requisito sirve al objetivo lo decide una persona |

## 4. La IA ya encuentra fallas más rápido de lo que se arreglan (Java y PHP, octubre 2026)

**Hechos verificados:**
- **53 vulnerabilidades de OpenJDK publicadas el mismo día**, el martes 20 de octubre de 2026, en la actualización trimestral: según Azul, «the most in a single update in well over a decade» y 7 veces el promedio de los últimos dos años (7,6 por trimestre). Fuentes: [Azul](https://www.azul.com/newsroom/openjdk-vulnerabilities-disclosed-today-set-an-all-time-high-azul-patches-them-all/), [advisory de OpenJDK](https://openjdk.org/groups/vulnerability/advisories/2026-10-20). Azul **no** dice que las haya encontrado una IA.
- Scott Sellers (CEO de Azul): «AI has collapsed the time between disclosure and exploitation from weeks to days to hours».
- IBM y Red Hat (Lightwell) encontraron y arreglaron con IA más de 400 vulnerabilidades en librerías Java populares ([Cybersecurity Dive, 6-oct-2026](https://www.cybersecuritydive.com/news/ibm-ai-vulnerability-java-lightwell/832249/)).
- Katie Norton (IDC): «The industry can now find vulnerabilities far faster than it can coordinate and ship fixes» ([TechTarget, 12-oct-2026](https://www.techtarget.com/it-infrastructure/news/366651908/AI-security-projects-deliver-first-fixes-for-vulnerable-Java-libraries)).
- Antecedente citado por Azul: con una herramienta de IA, investigadores encontraron en unos 10 minutos una falla de ejecución remota de 13 años en Apache ActiveMQ.

**Lo que probablemente se recordaba como «Java, severidad 10, el miércoles, oculta 17 años» es PHP2Shell** (búsqueda del 2026-10-24). Coincide en casi todo menos en el lenguaje y los años:

| Dato | Lo confirmado | Fuente |
|---|---|---|
| El miércoles | Parches y detalles publicados el **miércoles 21-oct-2026** (anuncio previo el 20) | [Wikipedia: PHP2Shell](https://en.wikipedia.org/wiki/PHP2Shell), [Help Net Security](https://www.helpnetsecurity.com/2026/10/21/php2shell-php-vulnerabilities-patched-cve-2026-109618-cve-2026-109619/) |
| «Severidad 10» | CVE-2026-109618: CVSS v4 9,2 / v3.x 9,8. watchTowr la calificó **10,0** | Wikipedia; [watchTowr](https://watchtowr.com/intelligence/php-cve-2026-109618-faq/) |
| Oculta muchos años | Afecta desde **PHP 5.4 (2012)**: unos 14 años. Wiz: «had remained hidden in the PHP codebase for more than a decade». **«17 años» no aparece en ninguna fuente** | Wikipedia; [Daily Caller](https://dailycaller.com/2026/10/23/artificial-intelligence-php-hackers-wiz-calif-openai/) |
| La encontró una IA | Calif (con GPT-5.6 Sol, proyecto «Patch the Planet» de OpenAI) y Wiz (con Gemini, GPT-5.6 Sol y su herramienta), en agosto | Wikipedia; [CNN](https://www.cnn.com/2026/10/21/tech/php2shell-vulnerability-ai-intl) |
| Alcance | ~70 % de la web comercial usa PHP | Wikipedia (W3Techs) |

**Frase segura:** «El miércoles salió una falla crítica en PHP, el lenguaje de casi el 70 % de la web, escondida desde 2012. La encontró una IA.» **No decir** «Java», «100» ni «17 años». Lo de Java que sí es verdad es otra cosa: 53 vulnerabilidades de OpenJDK en un día, el martes 20.

**Qué valida:** encontrar fallas dejó de ser lo caro. La IA las encuentra más rápido de lo que se arreglan, y las encuentra en código que pasó años de revisión humana. El paso siguiente es preguntar qué debía hacer ese código: sin una regla decidida y escrita, no hay contra qué probar.

## 5. Contexto académico (Microsoft Research)

- **Verus** verifica Rust con un solver SMT (Microsoft Research y colaboradores). Ya figura `verificado` en `AFIRMACIONES.md`.
- **VeruSAGE-Bench** (Microsoft Research): 849 tareas de prueba sacadas de 8 sistemas Rust verificados con Verus. La mejor combinación de modelo y agente completa más del 80 %. Modelos evaluados: o4-mini, GPT-5, Sonnet 4 y 4.5. Paper: [VeruSAGE, arXiv 2512.18436](https://arxiv.org/abs/2512.18436) (verificado el 2026-10-24). Repo: <https://github.com/microsoft/verus-proof-synthesis>.
- **PDD Kit** (Proof-Driven Development Kit, Microsoft Research + GitHub Next): **anunciado** como research preview alrededor del 21-oct-2026. Fuentes oficiales: [GitHub Next](https://x.com/GitHubNext/status/2112936525457740139), [GitHub](https://x.com/github/status/2112938664959562081), [Microsoft Research](https://x.com/MSFTResearch/status/2112987215496093979). Pasa del plan (en Chopin, de GitHub Next) a una spec formal en Verus que **aprueba una persona**, y prueba que el código del agente la cumple; donde no se puede, cae a tests. Solo Rust. GitHub: «enable teams to ship AI-generated code to production without reviewing it line by line». Se muestra en GitHub Universe (28-29 oct). No hay repo ni documentación pública todavía: se nombra como anuncio, con fecha.

## 6. Anthropic dejó git: 30.000 merges por día y la revisión pasa a ser de intención

> **Por qué importa:** es una mirada al futuro de cómo una empresa que ya trabaja con agentes a escala ve el desarrollo de software. Va en el beat de «cambio de época» (`PITCH_BOCETO.md` 0:00) y en la visión.

**Fuente primaria:** Anthropic Engineering, *«Redesigning source control at Anthropic»*, 13 de octubre de 2026 (actualizado el 15). <https://www.anthropic.com/engineering/redesigning-source-control>
Cobertura: [The Pragmatic Engineer](https://blog.pragmaticengineer.com/the-pulse-anthropic-builds-its-own-source-control-system/), [The Register](https://www.theregister.com/a/5302943).

**Corrección a cómo lo veníamos diciendo:** no es «su propio GitHub» ni «20.000 PRs por día». Construyeron **Scion**, un sistema de control de versiones propio (reemplaza a git en su monorepo), más **Antique**, su herramienta de code review. La cifra es de **merges**: de ~2.500 por día en mayo de 2026 a más de 30.000 en septiembre. No encontramos fuente para «20.000 PRs» (búsqueda del 2026-10-24); decir «más de 30.000 cambios mergeados por día».

**Hechos del post:**
- Un equipo de **siete personas** construyó Scion y Antique y migró todo el monorepo fuera de git en **cinco meses**, mientras el volumen de merges se multiplicaba por 10.
- Salvedad del propio post: «Scion is by no means a suitable replacement for git for general use.» Solo tiene sentido para monorepos enormes, con decenas de miles de ingenieros o «swarms of agents».

**Las citas que sostienen nuestro problema (textuales, verificadas contra la página el 2026-10-24):**

| Cita textual | Qué valida para Speco |
|---|---|
| «At Anthropic, coding is no longer the bottleneck to building systems or doing research.» | Es nuestra apertura («construir dejó de ser caro») dicha por Anthropic |
| «In May 2026, Anthropic averaged around 2,500 code changes merged per day; as of September, we merged over 30,000 per day.» | El volumen ya no se puede leer línea por línea. Nadie lee 30.000 diffs por día |
| «the latent demand for merging code is practically infinite, and every bottleneck we remove immediately leads to a further increase in the amount of code we produce.» | El código no va a dejar de crecer. Lo escaso es otra cosa |
| «Very often, we found that the role of the engineers was to tell Claude "no."» | **La pieza central.** El trabajo humano pasa a ser decidir qué no se hace. Es «podá en la spec, no en el código» |
| «Agents will sometimes violate core system constraints to satisfy a pattern that should never have been allowed in the first place.» | El agente rompe reglas que nadie escribió como regla. Mismo patrón que `EXPERIMENTO_RETRABAJO.md` (el agente decide solo lo que nadie fijó) |
| «Our team members still review every change request for the system, but they now examine the *intent* of the change as opposed to reading every line of code.» | **Revisar intención en vez de líneas** es literalmente lo que hace Speco. La palabra *intent* va en cursiva en el original |
| «the code review tooling we built can express complex semantic constraints on approvals, which lets us differentiate simple things like comment-only changes from sensitive logical changes, so that human reviewers can focus on the most consequential changes.» | Tuvieron que construir aprobaciones que distinguen lo que importa de lo que no. Para reglas de negocio, ese filtro es Speco |

**Salvedades al decirlo:**
- La revisión de intención la describe el equipo de Scion para **su** sistema, no como política de toda Anthropic.
- Anthropic no habla de specs ni de reglas de negocio. La inferencia «si se revisa la intención, la intención tiene que estar escrita en algún lado» es nuestra.
- Cifras de terceros como «pico de 30.401 el 9 de septiembre» o «promedio de 7 días ~18.000» salen de blogs secundarios, no del post: no decirlas.

## 7. «Anyway, it's Wednesday»: un solo miércoles de seguridad (21-oct-2026)

> **Por qué importa:** en clave de humor, resume la semana: la IA encuentra fallas más rápido de lo que se arreglan, y lo que se cae es software que pasó años de revisión humana. Sirve como gancho de 5 segundos o para preguntas, **no** como dato duro.

**Fuente:** post de ⁵⁄₉ ([@fiveoutofnine](https://x.com/fiveoutofnine)) del miércoles 21 de octubre de 2026, con unos 4 millones de vistas según el [Daily Caller](https://dailycaller.com/2026/10/23/artificial-intelligence-php-hackers-wiz-calif-openai/) (23-oct). No tenemos el link directo al post: mostrar una captura con el autor visible. Arranca: «So basically, today PHP got two critical bugs that let anyone run code on your server without even logging in, which is bad, and then the details leaked before the patch was even out, which is worse…» y cierra: «Anyway, it's Wednesday».

**Qué del tweet está confirmado por prensa (2026-10-24):**

| Afirmación del tweet | Estado | Fuente |
|---|---|---|
| PHP: dos bugs críticos de ejecución remota sin login («php2shell»), detalles filtrados antes del parche | verificado | CVE-2026-109618 y CVE-2026-109619, CVSS v4 9,2; parches el miércoles 21-oct (PHP 8.5.12, 8.4.27, 8.3.36, 8.2.35). [CyberScoop](https://cyberscoop.com/php-emergency-patches-php2shell-vulnerabilities/), [iTnews](https://www.itnews.com.au/news/critical-flaws-strike-php-as-disclosure-embargo-is-broken-629794), [Snyk](https://snyk.io/blog/php-patches-critical-unauthenticated-rces/) |
| Las encontró una IA | con matiz | No lo dice el tweet; lo reporta [The Next Web](https://thenextweb.com/news/php2shell-php-rce-ai-openai-wiz) (modelos de OpenAI y Google; Calif y Wiz). Útil para nuestro argumento, pero citarlo con su fuente |
| FBI, CISA, Reino Unido y Europa recomendaron sacar sistemas de línea; cientos de sitios offline | verificado | [The Record](https://therecord.media/php-script-vulnerabilities-warnings), [Decrypt](https://decrypt.co/381519/php-panic-critical-bugs-70-percent-internet-risk-everyone-freaking-out) |
| La primera ministra de Japón publicó una advertencia en X | verificado | Sanae Takaichi, 21-oct. [nippon.com / Jiji](https://www.nippon.com/en/news/yjj2026102101249/). **Ojo:** el tweet dice «el Primer Ministro» y «a las 5:55»; la prensa lo ubica a la noche y no da hora. No repetir «5:55» |
| eMudhra: una CA con una clave privada que valía **4** | verificado | Ocho intermedias con claves P-384 menores a 256; Google, Apple, Microsoft y Mozilla las bloquearon. [BleepingComputer](https://bleepingcomputer.com/news/security/mozilla-google-apple-block-compromised-emudhra-ca-certificates) |
| GitLab: CVSS 10.0 | con matiz | El CVSS 10.0 que existe es CVE-2026-85706 (path traversal sin login), parcheado el **10 de septiembre** y en el catálogo KEV de CISA el 11: no es de ese miércoles. «Presente desde 2014» no aparece en ninguna fuente ([Rapid7](https://www.rapid7.com/blog/post/etr-cve-2026-85706-critical-gitlab-path-traversal-exploited-in-the-wild/), [watchTowr](https://watchtowr.com/intelligence/rapid-reaction-gitlab-critical-path-traversal-vulnerability-cve-2026-85706/); búsqueda del 2026-10-24). No usarlo |
| LiteLLM 1.107.0 secuestrado con credential stealer y RAT | verificado | Subida a PyPI el 21-oct a las 11:39 UTC y en cuarentena a las 13:20; también las imágenes Docker. Robaba claves SSH, credenciales cloud y claves de proveedores de LLM. [The Hacker News](https://thehackernews.com/2026/10/litellm-compromised-in-supply-chain.html), [Wiz](https://www.wiz.io/blog/litellm-compromised-steals-credentials), [Socket](https://socket.dev/blog/litellm-compromise) |
| «1,5 millones de servidores» (Censys) | con matiz | Censys: ~2,6 millones de hosts con PHP, ~1,5 millones en versiones sin parche disponible. Solo en un resumen de búsqueda de [Calcalist](https://www.calcalistech.com/ctechnews/article/bwu96uott); no lo leímos en la fuente. Decir con «según Censys» o no decirlo |
| Railway, TiDB Cloud, Zeabur, Node.js, Plex, Tor, SafePay, banco indio | placeholder | No verificado (búsqueda del 2026-10-24). No decir sueltos |

**Cómo usarlo:** leer en pantalla solo la primera línea y el remate («Anyway, it's Wednesday»), o mostrar el tweet entero de fondo mientras se dice: «Esto fue un solo miércoles de esta semana.» Si alguien pregunta por un dato puntual, contestar solo con las filas `verificado`.

---

## Cómo usarlo en el pitch

**Arco recomendado (20-25 s, beat del problema).** Cada frase tiene un rol; no leer más de dos citas en voz alta, el resto va en pantalla:

1. *Contexto:* «La IA ya encuentra fallas en casi todo el software: esta semana, 53 vulnerabilidades de Java en un solo día. Hace falta probar que el código es correcto.»
2. *El giro:* «Pero Anthropic lo dice en su paper: para probar que algo es correcto, primero hay que decir qué significa "correcto". Eso es la spec.»
3. *El problema:* «Y el mismo paper admite que conseguir una spec completa y sin ambigüedad es el obstáculo, y que "a proof checker can't tell you whether your spec matches reality".»
4. *Puente a Speco:* «En un PNG lo correcto lo dice un estándar. En un banco, lo decide una persona. Speco es donde se decide, se revisa y queda registrado.»

*Pantalla:* «To prove that a piece of software is correct, we must first state what "correct" even means.» — Anthropic, 22-oct-2026.

**Apertura con Anthropic dejando git (§6), para el beat de «cambio de época» (10-15 s):**

> «Anthropic pasó de 2.500 a más de 30.000 cambios mergeados por día en cuatro meses. Tuvo que dejar git. Y lo que cuentan es esto: *"the role of the engineers was to tell Claude 'no'"*, y ahora revisan *"the intent of the change as opposed to reading every line of code."* Revisar la intención, no las líneas. Eso es Speco, para las reglas de negocio.»

*Pantalla:* «2.500 → 30.000 merges/día» y la cita de *intent*, con «Anthropic, 13-oct-2026» debajo.

**Gancho del miércoles (§7), 5 s, opcional:** mostrar el tweet de fondo y decir «Esto fue un solo miércoles de esta semana». No leer cifras sueltas del tweet.

**Cómo decir la nota 6 (reward hacking) sin exagerar:** «Hasta Anthropic tuvo que auditar al agente: podía hacer pasar cualquier prueba reescribiendo el programa para que nunca crashee.» Es **parecido** a lo que vimos en `EXPERIMENTO_RETRABAJO.md` (el agente resuelve solo lo que nadie fijó), no el mismo hallazgo: allá el agente eligió una regla, acá podía cambiar el programa. No decir «lo mismo que probamos nosotros». Va mejor en preguntas que en el pitch.

**«"Formally verified" does not mean "bug-free"»:** sirve para preguntas («¿la verificación formal no resuelve todo?»), no para el pitch. Leída sola puede sonar a que la verificación no sirve, y no es nuestro argumento: sirve, pero prueba lo que la spec dice.

**Frase (15 s), para el beat del problema o el de visión:**

> «Esta semana salieron 53 vulnerabilidades de Java en un solo día, un récord en más de diez años. Y Anthropic y Theorem probaron formalmente más de cien librerías open source en unas semanas. Probar que el código cumple una spec ya lo hace una IA. Y el mismo paper lo dice: *"a proof checker can't tell you whether your spec matches reality"*. El cuello de botella es la spec. Ahí entra Speco.»

*Pantalla:* la cita, con «Anthropic, 22-oct-2026» debajo.

**Para la pregunta «¿La verificación formal no los vuelve innecesarios?»:**

> «Al revés. Anthropic dice que lo difícil ahora es conseguir "a comprehensive and unambiguous spec". Ellos prueban que no crashea; nadie les puede decir con un fuzz test que el umbral de fraude es 10.000. Esa regla la decide una persona, y Speco hace que esté completa, sin contradicciones y aprobada antes de que alguien la pruebe.»

**Qué NO decir:**
- Que Speco verifica código, o que se integra con Theorem, crosscheck o Rocq. No existe.
- Que Anthropic o Theorem «validan a Speco». Validan **el problema**: la spec es el cuello de botella. No nos conocen.
- Que probaron que esas librerías no tienen bugs: el propio post dice que no.
- Cifras sin su salvedad: «crash-free» siempre con «para inputs de hasta 64 MB».
- «100 vulnerabilidades críticas de Java ocultas hace 17 años»: no existe así. Era PHP2Shell, escondida desde 2012 (§4). Para Java, decir «53 en un día, récord en más de una década».
- Que las 53 de OpenJDK las encontró una IA: la fuente no lo dice.
- «Anthropic hizo su propio GitHub» o «20.000 PRs por día»: es un control de versiones propio (Scion) y son más de 30.000 **merges** por día (§6).
- Que Anthropic revisa intención «en toda la empresa»: lo dice el equipo de Scion sobre su sistema.
- Datos sueltos del tweet del miércoles que no estén `verificado` en §7 (LiteLLM 1.107.0, «5:55», «desde 2014»).
