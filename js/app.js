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
      platos = data;
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

// =========================
// FORM + VALIDACIÓN
// =========================
function obtenerDatosFormulario() {
  return {
    titulo: $("#inputTitulo").val().trim(),
    orden: $("#inputOrden").val().trim().toLowerCase(),
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

  const tipos = [...new Set(platos.map(p => p.orden))];
  let contador = 0;

  tipos.forEach(tipo => {
    const titulo = document.createElement("h2");
    titulo.textContent = tipo.toUpperCase();
    titulo.style.margin = "1rem 0";
    contenedor.appendChild(titulo);

    platos.filter(p => p.orden === tipo).forEach(p => {
      const posicion = (contador % 2 === 0) ? "par" : "impar";
      contador++;

      const card = document.createElement("article");
      card.className = "card-plato";
      card.dataset.id = p.id;
      card.dataset.posicion = posicion;

      //Lee toda la tarjeta (título + desc + precio)
      const textoTarjeta =
        `Plato ${p.titulo}. ${p.descripcion}. Precio ${formatearPrecio(p.precio)}.`;

      //Lee la foto si tabulas a la imagen
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
}
