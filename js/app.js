// =========================
// CONFIG API (Google Apps Script)
// =========================
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzIlNHGOM-giaTfW1UBrTiyXMwYVrUu4zoJsJuDVMrrY-cP2iWGYRo_3jxpmfdquITpLA/exec";

// =========================
// ESTADO GLOBAL
// =========================
let idiomaActual = "es";
let platos = [];

let idEditando = null;
let ultimoBorrado = null;
let temporizadorDeshacer = null;

// =========================
// TEXTOS i18n (UI fija)
// =========================
const textos = {
  es: {
    tituloApp: "Carta",
    nuevo: "Nuevo",
    cancelar: "Cancelar",
    guardar: "Guardar",
    modalNuevo: "Nuevo plato",
    modalEditar: "Editar plato",
    lblTitulo: "Título",
    lblOrden: "Orden",
    lblDescripcion: "Descripción",
    lblPrecio: "Precio",
    lblImagen: "Imagen (ruta)",
    cargando: "Cargando menú…",
    errorCarga: "No se pudo cargar el menú.",
    okGuardado: "Plato guardado.",
    okBorrado: "Plato eliminado.",
    deshacer: "Deshacer",
    tooltipEditar: "Editar plato",
    tooltipBorrar: "Eliminar plato",
    errTitulo: "El título es obligatorio (mín. 3 caracteres).",
    errOrden: "El orden debe ser: entrante, primero, segundo o postre.",
    errDescripcion: "La descripción es obligatoria (mín. 10 caracteres).",
    errPrecio: "El precio debe ser un número mayor que 0.",
    errImagen: "La imagen debe ser una ruta válida (ej: img/plato.jpg)."
  },
  en: {
    tituloApp: "Menu",
    nuevo: "New",
    cancelar: "Cancel",
    guardar: "Save",
    modalNuevo: "New dish",
    modalEditar: "Edit dish",
    lblTitulo: "Title",
    lblOrden: "Order",
    lblDescripcion: "Description",
    lblPrecio: "Price",
    lblImagen: "Image (path)",
    cargando: "Loading menu…",
    errorCarga: "Menu could not be loaded.",
    okGuardado: "Dish saved.",
    okBorrado: "Dish deleted.",
    deshacer: "Undo",
    tooltipEditar: "Edit dish",
    tooltipBorrar: "Delete dish",
    errTitulo: "Title is required (min 3 chars).",
    errOrden: "Order must be: entrante, primero, segundo or postre.",
    errDescripcion: "Description is required (min 10 chars).",
    errPrecio: "Price must be a number greater than 0.",
    errImagen: "Image must be a valid path (e.g. img/dish.jpg)."
  }
};

function t(clave) {
  return textos[idiomaActual][clave];
}

// Títulos de secciones (orden fijo)
const titulosSeccion = {
  es: { entrante: "ENTRANTE", primero: "PRIMERO", segundo: "SEGUNDO", postre: "POSTRE" },
  en: { entrante: "STARTER", primero: "FIRST", segundo: "MAIN", postre: "DESSERT" }
};

// =========================
// ARRANQUE
// =========================
$(function () {
  aplicarTextosUI();
  cargarMenuDesdeAPI(idiomaActual);

  $("#btnIdioma").on("click", alternarIdioma);
  $("#btnNuevo").on("click", () => abrirModal("nuevo"));
  $("#btnCancelar").on("click", cerrarModal);

  $("#formPlato").on("submit", function (e) {
    e.preventDefault();
    guardarPlatoAPI();
  });

  $("#modal").on("click", function (e) {
    if (e.target.id === "modal") cerrarModal();
  });

  // Delegación dinámica
  $("#listaPlatos")
    .on("click", ".btn-editar", function () {
      const id = Number($(this).closest(".card-plato").data("id"));
      abrirModal("editar", id);
    })
    .on("click", ".btn-borrar", function () {
      const id = Number($(this).closest(".card-plato").data("id"));
      borrarPlatoAPI(id);
    });

  configurarAtajosTeclado();
});

// =========================
// API GET (JSONP) — funciona en Local y GitHub Pages
// =========================
function cargarMenuDesdeAPI(idioma) {
  $("#estadoCarga").text(textos[idioma].cargando);
  $("#listaPlatos").empty();

  const callbackName = "cb_" + Date.now();

  // callback global
  window[callbackName] = function (res) {
    try {
      delete window[callbackName];
      script.remove();

      if (!res || res.ok !== true || !Array.isArray(res.menu)) {
        $("#estadoCarga").text(textos[idioma].errorCarga);
        return;
      }

      platos = res.menu.map(p => ({
        ...p,
        orden: normalizarOrden(p.orden)
      }));

      $("#estadoCarga").text("");
      mostrarPorOrdenDinamico(platos);
    } catch (e) {
      $("#estadoCarga").text(textos[idioma].errorCarga);
    }
  };

  const script = document.createElement("script");
  script.src = `${GAS_URL}?action=get&lang=${encodeURIComponent(idioma)}&callback=${callbackName}`;
  script.onerror = function () {
    delete window[callbackName];
    $("#estadoCarga").text(textos[idioma].errorCarga);
  };
  document.body.appendChild(script);
}

// =========================
// API POST (FORM + iframe) — evita CORS
// =========================
function apiPost(params) {
  return new Promise(resolve => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = GAS_URL;
    form.target = "iframe_api"; // requiere <iframe name="iframe_api">

    Object.entries(params).forEach(([k, v]) => {
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = k;
      i.value = String(v);
      form.appendChild(i);
    });

    document.body.appendChild(form);
    form.submit();

    // GAS tarda un poco, damos margen y recargamos luego con GET
    setTimeout(() => {
      form.remove();
      resolve();
    }, 900);
  });
}

// =========================
// CRUD contra Drive (GAS)
// =========================
async function guardarPlatoAPI() {
  const platoFormulario = obtenerDatosFormulario();
  if (!validarFormulario(platoFormulario)) return;

  $("#btnGuardar").prop("disabled", true);

  try {
    await apiPost({
      action: "upsert",
      lang: idiomaActual,
      sync: "both",
      dish: JSON.stringify({
        id: idEditando, // null => GAS asigna
        ...platoFormulario
      })
    });

    cerrarModal();
    mostrarToast(t("okGuardado"));
    cargarMenuDesdeAPI(idiomaActual);
  } catch (e) {
    mostrarToast("❌ Error guardando");
  } finally {
    $("#btnGuardar").prop("disabled", false);
  }
}

async function borrarPlatoAPI(id) {
  // UX optimista (visual rápido)
  const indice = platos.findIndex(p => Number(p.id) === Number(id));
  if (indice === -1) return;

  ultimoBorrado = { plato: platos[indice], indice };
  platos.splice(indice, 1);
  mostrarPorOrdenDinamico(platos);
  mostrarToastConDeshacer(t("okBorrado"), t("deshacer"));

  try {
    await apiPost({
      action: "delete",
      lang: idiomaActual,
      sync: "both",
      id: id
    });

    if (temporizadorDeshacer) clearTimeout(temporizadorDeshacer);
    temporizadorDeshacer = setTimeout(() => {
      ultimoBorrado = null;
      temporizadorDeshacer = null;
    }, 5000);
  } catch (e) {
    // si falla, revertimos UI
    deshacerBorradoLocal();
    mostrarToast("Error borrando");
  }
}

// Deshacer solo visual
function deshacerBorrado() {
  deshacerBorradoLocal();
}
function deshacerBorradoLocal() {
  if (!ultimoBorrado) return;

  platos.splice(ultimoBorrado.indice, 0, ultimoBorrado.plato);
  ultimoBorrado = null;

  if (temporizadorDeshacer) {
    clearTimeout(temporizadorDeshacer);
    temporizadorDeshacer = null;
  }

  mostrarPorOrdenDinamico(platos);
  mostrarToast(t("deshacer"));
}

// =========================
// MODAL
// =========================
function abrirModal(modo, id) {
  limpiarErrores();

  if (modo === "nuevo") {
    idEditando = null;
    $("#modalTitulo").text(t("modalNuevo"));
    $("#formPlato")[0].reset();
  } else {
    const plato = platos.find(p => Number(p.id) === Number(id));
    if (!plato) return;

    idEditando = plato.id;
    $("#modalTitulo").text(t("modalEditar"));
    $("#inputTitulo").val(plato.titulo);
    $("#inputOrden").val(plato.orden);
    $("#inputDescripcion").val(plato.descripcion);
    $("#inputPrecio").val(plato.precio);
    $("#inputImagen").val(plato.imagen);
  }

  $("#modal").addClass("abierto").attr("aria-hidden", "false");
  $("#inputTitulo").focus();
}

function cerrarModal() {
  $("#modal").removeClass("abierto").attr("aria-hidden", "true");
}

// =========================
// FORM + VALIDACIÓN
// =========================
function obtenerDatosFormulario() {
  return {
    titulo: $("#inputTitulo").val().trim(),
    orden: normalizarOrden($("#inputOrden").val()),
    descripcion: $("#inputDescripcion").val().trim(),
    precio: Number($("#inputPrecio").val()),
    imagen: $("#inputImagen").val().trim()
  };
}

function validarFormulario(plato) {
  limpiarErrores();
  let ok = true;

  if (!plato.titulo || plato.titulo.length < 3) {
    marcarError("#inputTitulo", "#errorTitulo", t("errTitulo"));
    ok = false;
  }

  if (!["entrante", "primero", "segundo", "postre"].includes(plato.orden)) {
    marcarError("#inputOrden", "#errorOrden", t("errOrden"));
    ok = false;
  }

  if (!plato.descripcion || plato.descripcion.length < 10) {
    marcarError("#inputDescripcion", "#errorDescripcion", t("errDescripcion"));
    ok = false;
  }

  if (Number.isNaN(plato.precio) || plato.precio <= 0) {
    marcarError("#inputPrecio", "#errorPrecio", t("errPrecio"));
    ok = false;
  }

  // IMPORTANTE: tus imágenes son .jpg/.webp etc. Esto valida bien.
  if (!/^img\/.+\.(jpg|jpeg|png|webp)$/i.test(plato.imagen)) {
    marcarError("#inputImagen", "#errorImagen", t("errImagen"));
    ok = false;
  }

  if (!ok) $(".invalido").first().focus();
  return ok;
}

function marcarError(selectorInput, selectorError, mensaje) {
  $(selectorInput).addClass("invalido");
  $(selectorError).text(mensaje);
}

function limpiarErrores() {
  $(".invalido").removeClass("invalido");
  $(".error").text("");
}

// Normaliza orden (quita acentos + minúsculas)
function normalizarOrden(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// =========================
// i18n UI
// =========================
function alternarIdioma() {
  idiomaActual = (idiomaActual === "es") ? "en" : "es";
  aplicarTextosUI();
  cargarMenuDesdeAPI(idiomaActual);
}

function aplicarTextosUI() {
  $("#tituloApp").text(t("tituloApp"));
  $("#txtNuevo").text(t("nuevo"));
  $("#txtCancelar").text(t("cancelar"));
  $("#txtGuardar").text(t("guardar"));
  $("#lblTitulo").text(t("lblTitulo"));
  $("#lblOrden").text(t("lblOrden"));
  $("#lblDescripcion").text(t("lblDescripcion"));
  $("#lblPrecio").text(t("lblPrecio"));
  $("#lblImagen").text(t("lblImagen"));
  $("#txtIdioma").text(idiomaActual.toUpperCase());
  $("html").attr("lang", idiomaActual);
}

// =========================
// TOAST
// =========================
function mostrarToast(mensaje) {
  const $t = $("#toast");
  $t.html(`<span>${escapeHtml(mensaje)}</span>`).addClass("mostrar");
  setTimeout(() => $t.removeClass("mostrar"), 2200);
}

function mostrarToastConDeshacer(mensaje, textoBoton) {
  const $t = $("#toast");

  $t.html(`
    <span>${escapeHtml(mensaje)}</span>
    <button id="btnDeshacer">${escapeHtml(textoBoton)} (Ctrl+Z)</button>
  `).addClass("mostrar");

  $("#btnDeshacer").off("click").on("click", function () {
    deshacerBorrado();
    $t.removeClass("mostrar");
  });

  setTimeout(() => $t.removeClass("mostrar"), 5000);
}

// =========================
// ATAJOS
// =========================
function configurarAtajosTeclado() {
  $(document).on("keydown", function (e) {
    const tecla = e.key.toLowerCase();
    const ctrlCmd = e.ctrlKey || e.metaKey;

    if (ctrlCmd && e.shiftKey && (e.key === "+" || e.code === "Equal")) {
      e.preventDefault();
      abrirModal("nuevo");
    }

    if (ctrlCmd && tecla === "s" && $("#modal").hasClass("abierto")) {
      e.preventDefault();
      $("#formPlato").trigger("submit");
    }

    if (tecla === "escape" && $("#modal").hasClass("abierto")) {
      e.preventDefault();
      cerrarModal();
    }

    if (ctrlCmd && tecla === "z") {
      e.preventDefault();
      deshacerBorrado();
    }
  });
}

// =========================
// UTILIDADES
// =========================
function formatearPrecio(precio) {
  return `${Number(precio).toFixed(2)} €`;
}

function escapeHtml(texto) {
  return String(texto)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =========================
// MOSTRAR POR ORDEN (como tu diseño)
// =========================
function mostrarPorOrdenDinamico(platos) {
  const contenedor = document.getElementById("listaPlatos");
  contenedor.innerHTML = "";

  const ordenSecciones = ["entrante", "primero", "segundo", "postre"];
  let contador = 0;

  ordenSecciones.forEach(tipo => {
    const platosDeTipo = platos.filter(p => normalizarOrden(p.orden) === tipo);
    if (platosDeTipo.length === 0) return;

    const titulo = document.createElement("h2");
    titulo.textContent = (titulosSeccion[idiomaActual]?.[tipo]) || tipo.toUpperCase();
    titulo.style.margin = "1rem 0";
    contenedor.appendChild(titulo);

    platosDeTipo.forEach(p => {
      const posicion = (contador % 2 === 0) ? "par" : "impar";
      contador++;

      const card = document.createElement("article");
      card.className = "card-plato";
      card.dataset.id = p.id;
      card.dataset.posicion = posicion;

      const textoTarjeta =
        (idiomaActual === "en")
          ? `Dish ${p.titulo}. ${p.descripcion}. Price ${formatearPrecio(p.precio)}.`
          : `Plato ${p.titulo}. ${p.descripcion}. Precio ${formatearPrecio(p.precio)}.`;

      const textoImagen =
        (idiomaActual === "en")
          ? `Photo of the dish ${p.titulo}.`
          : `Fotografía del plato ${p.titulo}.`;

      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", textoTarjeta);

      // Nota: img src es relativo y funciona en local y GitHub Pages
      card.innerHTML = `
        <div class="card-contenido">

          <div class="card-imagen" tabindex="0" role="img" aria-label="${escapeHtml(textoImagen)}">
            <img src="${escapeHtml(p.imagen)}" alt="${escapeHtml(textoImagen)}">
            <span class="solo-lectores">${escapeHtml(textoImagen)}</span>
          </div>

          <div class="card-texto">
            <h2>${escapeHtml(p.titulo)}</h2>
            <p>${escapeHtml(p.descripcion)}</p>
            <div class="card-precio">${formatearPrecio(p.precio)}</div>

            <div class="card-acciones" aria-label="Acciones del plato">
              <button class="btn btn-icono btn-editar"
                      aria-label="${escapeHtml(t("tooltipEditar"))} ${escapeHtml(p.titulo)}"
                      title="${escapeHtml(t("tooltipEditar"))}">
                <i class="fa-solid fa-pen" aria-hidden="true"></i>
              </button>

              <button class="btn btn-icono btn-borrar"
                      aria-label="${escapeHtml(t("tooltipBorrar"))} ${escapeHtml(p.titulo)}"
                      title="${escapeHtml(t("tooltipBorrar"))}">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>

        </div>
      `;

      contenedor.appendChild(card);
    });
  });
}


/*
// =========================
// ESTADO GLOBAL
// =========================
let idiomaActual = "es";
let platos = [];

let idEditando = null;
let ultimoBorrado = null;
let temporizadorDeshacer = null;

// =========================
// TEXTOS i18n
// =========================
const textos = {
  es: {
    tituloApp: "Carta",
    nuevo: "Nuevo",
    cancelar: "Cancelar",
    guardar: "Guardar",
    modalNuevo: "Nuevo plato",
    modalEditar: "Editar plato",
    lblTitulo: "Título",
    lblOrden: "Orden",
    lblDescripcion: "Descripción",
    lblPrecio: "Precio",
    lblImagen: "Imagen (ruta)",
    cargando: "Cargando menú…",
    errorCarga: "No se pudo cargar el menú.",
    okGuardado: "Plato guardado.",
    okBorrado: "Plato eliminado.",
    deshacer: "Deshacer",
    tooltipEditar: "Editar plato",
    tooltipBorrar: "Eliminar plato",
    errTitulo: "El título es obligatorio (mín. 3 caracteres).",
    errOrden: "El orden debe ser: entrante, primero, segundo o postre.",
    errDescripcion: "La descripción es obligatoria (mín. 10 caracteres).",
    errPrecio: "El precio debe ser un número mayor que 0.",
    errImagen: "La imagen debe ser una ruta válida (ej: img/plato.jpg)."
  },
  en: {
    tituloApp: "Menu",
    nuevo: "New",
    cancelar: "Cancel",
    guardar: "Save",
    modalNuevo: "New dish",
    modalEditar: "Edit dish",
    lblTitulo: "Title",
    lblOrden: "Order",
    lblDescripcion: "Description",
    lblPrecio: "Price",
    lblImagen: "Image (path)",
    cargando: "Loading menu…",
    errorCarga: "Menu could not be loaded.",
    okGuardado: "Dish saved.",
    okBorrado: "Dish deleted.",
    deshacer: "Undo",
    tooltipEditar: "Edit dish",
    tooltipBorrar: "Delete dish",
    errTitulo: "Title is required (min 3 chars).",
    errOrden: "Order must be: starter, first, second or dessert.",
    errDescripcion: "Description is required (min 10 chars).",
    errPrecio: "Price must be a number greater than 0.",
    errImagen: "Image must be a valid path (e.g. img/dish.jpg)."
  }
};

function t(clave) {
  return textos[idiomaActual][clave];
}

// =========================
// ARRANQUE
// =========================
$(function () {
  aplicarTextosUI();
  cargarMenu(idiomaActual);

  $("#btnIdioma").on("click", alternarIdioma);
  $("#btnNuevo").on("click", () => abrirModal("nuevo"));
  $("#btnCancelar").on("click", cerrarModal);

  $("#formPlato").on("submit", function (e) {
    e.preventDefault();
    guardarPlato();
  });

  $("#modal").on("click", function (e) {
    if (e.target.id === "modal") cerrarModal();
  });

  $("#listaPlatos")
    .on("click", ".btn-borrar", function () {
      const id = Number($(this).closest(".card-plato").data("id"));
      borrarPlato(id);
    });

  configurarAtajosTeclado();
});

// =========================
// AJAX
// =========================
function cargarMenu(idioma) {
  $("#estadoCarga").text(textos[idioma].cargando);

  $.ajax({
    url: `data/menu_${idioma}.json`,
    method: "GET",
    dataType: "json"
  })
    .done(function (data) {
      // Normalizamos orden al cargar (limpia datos antiguos con mayúsculas)
      platos = data.map(p => ({
        ...p,
        orden: normalizarOrden(p.orden)
      }));

      $("#estadoCarga").text("");
      mostrarPorOrdenDinamico(platos);
    })
    .fail(function () {
      $("#estadoCarga").text(textos[idioma].errorCarga);
    });
}

// =========================
// MODAL
// =========================
function abrirModal(modo, id) {
  limpiarErrores();

  if (modo === "nuevo") {
    idEditando = null;
    $("#modalTitulo").text(t("modalNuevo"));
    $("#formPlato")[0].reset();
  } else {
    const plato = platos.find(p => p.id === id);
    if (!plato) return;

    idEditando = id;
    $("#modalTitulo").text(t("modalEditar"));
    $("#inputTitulo").val(plato.titulo);
    $("#inputOrden").val(plato.orden);
    $("#inputDescripcion").val(plato.descripcion);
    $("#inputPrecio").val(plato.precio);
    $("#inputImagen").val(plato.imagen);
  }

  $("#modal").addClass("abierto").attr("aria-hidden", "false");
  $("#inputTitulo").focus();
}

function cerrarModal() {
  $("#modal").removeClass("abierto").attr("aria-hidden", "true");
}

// =========================
// CRUD
// =========================
function guardarPlato() {
  const platoFormulario = obtenerDatosFormulario();
  if (!validarFormulario(platoFormulario)) return;

  if (idEditando === null) {
    const nuevoId = platos.length ? Math.max(...platos.map(p => p.id)) + 1 : 1;
    platos.push({ id: nuevoId, ...platoFormulario });
  } else {
    const i = platos.findIndex(p => p.id === idEditando);
    if (i !== -1) platos[i] = { ...platos[i], ...platoFormulario };
  }

  mostrarPorOrdenDinamico(platos);
  cerrarModal();
  mostrarToast(t("okGuardado"));
}

function borrarPlato(id) {
  const indice = platos.findIndex(p => p.id === id);
  if (indice === -1) return;

  ultimoBorrado = { plato: platos[indice], indice };
  platos.splice(indice, 1);

  mostrarPorOrdenDinamico(platos);
  mostrarToastConDeshacer(t("okBorrado"), t("deshacer"));

  if (temporizadorDeshacer) clearTimeout(temporizadorDeshacer);
  temporizadorDeshacer = setTimeout(() => {
    ultimoBorrado = null;
    temporizadorDeshacer = null;
  }, 5000);
}

function deshacerBorrado() {
  if (!ultimoBorrado) return;

  platos.splice(ultimoBorrado.indice, 0, ultimoBorrado.plato);
  ultimoBorrado = null;

  if (temporizadorDeshacer) {
    clearTimeout(temporizadorDeshacer);
    temporizadorDeshacer = null;
  }

  mostrarPorOrdenDinamico(platos);
  mostrarToast("" + t("deshacer"));
}

//ordena platos nuevos segun tipo
function normalizarOrden(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita acentos
}

// =========================
// FORM + VALIDACIÓN
// =========================
function obtenerDatosFormulario() {
  return {
    titulo: $("#inputTitulo").val().trim(),
    orden: normalizarOrden($("#inputOrden").val()),
    descripcion: $("#inputDescripcion").val().trim(),
    precio: Number($("#inputPrecio").val()),
    imagen: $("#inputImagen").val().trim()
  };
}

function validarFormulario(plato) {
  limpiarErrores();
  let ok = true;

  if (!plato.titulo || plato.titulo.length < 3) {
    marcarError("#inputTitulo", "#errorTitulo", t("errTitulo"));
    ok = false;
  }

  if (!["entrante", "primero", "segundo", "postre"].includes(plato.orden.toLowerCase())) {
    marcarError("#inputOrden", "#errorOrden", t("errOrden"));
    ok = false;
  }

  if (!plato.descripcion || plato.descripcion.length < 10) {
    marcarError("#inputDescripcion", "#errorDescripcion", t("errDescripcion"));
    ok = false;
  }

  if (Number.isNaN(plato.precio) || plato.precio <= 0) {
    marcarError("#inputPrecio", "#errorPrecio", t("errPrecio"));
    ok = false;
  }

  if (!/^img\/.+\.(jpg|jpeg|png|webp)$/i.test(plato.imagen)) {
    marcarError("#inputImagen", "#errorImagen", t("errImagen"));
    ok = false;
  }

  if (!ok) $(".invalido").first().focus();
  return ok;
}

function marcarError(selectorInput, selectorError, mensaje) {
  $(selectorInput).addClass("invalido");
  $(selectorError).text(mensaje);
}

function limpiarErrores() {
  $(".invalido").removeClass("invalido");
  $(".error").text("");
}

// =========================
// i18n
// =========================
function alternarIdioma() {
  idiomaActual = (idiomaActual === "es") ? "en" : "es";
  aplicarTextosUI();
  cargarMenu(idiomaActual);
}

function aplicarTextosUI() {
  $("#tituloApp").text(t("tituloApp"));
  $("#txtNuevo").text(t("nuevo"));
  $("#txtCancelar").text(t("cancelar"));
  $("#txtGuardar").text(t("guardar"));
  $("#lblTitulo").text(t("lblTitulo"));
  $("#lblOrden").text(t("lblOrden"));
  $("#lblDescripcion").text(t("lblDescripcion"));
  $("#lblPrecio").text(t("lblPrecio"));
  $("#lblImagen").text(t("lblImagen"));
  $("#txtIdioma").text(idiomaActual.toUpperCase());
  $("html").attr("lang", idiomaActual);
}

// =========================
// TOAST
// =========================
function mostrarToast(mensaje) {
  const $t = $("#toast");
  $t.html(`<span>${escapeHtml(mensaje)}</span>`).addClass("mostrar");
  setTimeout(() => $t.removeClass("mostrar"), 2200);
}

function mostrarToastConDeshacer(mensaje, textoBoton) {
  const $t = $("#toast");

  $t.html(`
    <span>${escapeHtml(mensaje)}</span>
    <button id="btnDeshacer">${escapeHtml(textoBoton)} (Ctrl+Z)</button>
  `).addClass("mostrar");

  $("#btnDeshacer").off("click").on("click", function () {
    deshacerBorrado();
    $t.removeClass("mostrar");
  });

  setTimeout(() => $t.removeClass("mostrar"), 5000);
}

// =========================
// ATAJOS (Ctrl+Shift+Plus)
// =========================
function configurarAtajosTeclado() {
  $(document).on("keydown", function (e) {
    const tecla = e.key.toLowerCase();
    const ctrlCmd = e.ctrlKey || e.metaKey;

    // Ctrl + Shift + +  (e Ctrl+Shift+=)
    if (ctrlCmd && e.shiftKey && (e.key === "+" || e.code === "Equal")) {
      e.preventDefault();
      abrirModal("nuevo");
    }

    if (ctrlCmd && tecla === "s" && $("#modal").hasClass("abierto")) {
      e.preventDefault();
      $("#formPlato").trigger("submit");
    }

    if (tecla === "escape" && $("#modal").hasClass("abierto")) {
      e.preventDefault();
      cerrarModal();
    }

    if (ctrlCmd && tecla === "z") {
      e.preventDefault();
      deshacerBorrado();
    }
  });
}

// =========================
// UTILIDADES
// =========================
function formatearPrecio(precio) {
  return `${Number(precio).toFixed(2)} €`;
}

function escapeHtml(texto) {
  return String(texto)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =========================
// MOSTRAR POR ORDEN + ACCESIBILIDAD
// =========================
function mostrarPorOrdenDinamico(platos) {
  const contenedor = document.getElementById("listaPlatos");
  contenedor.innerHTML = "";

  const ordenSecciones = ["entrante", "primero", "segundo", "postre"];
  let contador = 0;

  ordenSecciones.forEach(tipo => {
    const platosDeTipo = platos.filter(p => normalizarOrden(p.orden) === tipo);
    if (platosDeTipo.length === 0) return;

    const titulo = document.createElement("h2");
    titulo.textContent = tipo.toUpperCase();
    titulo.style.margin = "1rem 0";
    contenedor.appendChild(titulo);

    platosDeTipo.forEach(p => {
      const posicion = (contador % 2 === 0) ? "par" : "impar";
      contador++;

      const card = document.createElement("article");
      card.className = "card-plato";
      card.dataset.id = p.id;
      card.dataset.posicion = posicion;

      // Accesibilidad: lee toda la tarjeta
      const textoTarjeta = `Plato ${p.titulo}. ${p.descripcion}. Precio ${formatearPrecio(p.precio)}.`;
      const textoImagen = `Fotografía del plato ${p.titulo}.`;

      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", textoTarjeta);

      card.innerHTML = `
        <div class="card-contenido">

          <div class="card-imagen"
               tabindex="0"
               role="img"
               aria-label="${escapeHtml(textoImagen)}">
            <img src="${p.imagen}" alt="">
            <span class="solo-lectores">${escapeHtml(textoImagen)}</span>
          </div>

          <div class="card-texto">
            <h2>${escapeHtml(p.titulo)}</h2>
            <p>${escapeHtml(p.descripcion)}</p>
            <div class="card-precio">${formatearPrecio(p.precio)}</div>

            <div class="card-acciones" aria-label="Acciones del plato">
              <button class="btn btn-icono btn-borrar"
                      aria-label="${t("tooltipBorrar")} ${escapeHtml(p.titulo)}"
                      title="${t("tooltipBorrar")}">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>

        </div>
      `;

      contenedor.appendChild(card);
    });
  });
}*/