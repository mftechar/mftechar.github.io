/* ============================================================================
   Utilidades de fecha compartidas — MF Tech AR
   ----------------------------------------------------------------------------
   Formato estándar para toda la web: DD/MM/AAAA.
   Usar window.mfFecha en nuevas herramientas para mantener consistencia.
   ========================================================================== */
(() => {
  'use strict';

  function parseFecha(input) {
    if (input instanceof Date) {
      if (isNaN(input.getTime())) throw new Error('Fecha inválida');
      return new Date(input.getTime());
    }
    if (typeof input === 'number') {
      const d = new Date(input);
      if (isNaN(d.getTime())) throw new Error('Fecha inválida');
      return d;
    }
    if (typeof input === 'string') {
      const s = input.trim();
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (isNaN(d.getTime())) throw new Error('Fecha inválida: ' + s);
        return d;
      }
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        if (isNaN(d.getTime())) throw new Error('Fecha inválida: ' + s);
        return d;
      }
      const d = new Date(s);
      if (isNaN(d.getTime())) throw new Error('Fecha inválida: ' + s);
      return d;
    }
    throw new Error('Tipo de fecha no soportado');
  }

  function formatoFecha(date) {
    const d = parseFecha(date);
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  }

  function formatoISO(date) {
    const d = parseFecha(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatoArchivo(date) {
    // Para nombres de archivo: DD-MM-AAAA
    return formatoFecha(date).replace(/\//g, '-');
  }

  function sumarDias(fecha, dias) {
    const d = parseFecha(fecha);
    d.setDate(d.getDate() + dias);
    return d;
  }

  function sumarMeses(fecha, meses) {
    const d = parseFecha(fecha);
    const diaOriginal = d.getDate();
    d.setMonth(d.getMonth() + meses);
    if (d.getDate() !== diaOriginal) d.setDate(0);
    return d;
  }

  function diasEntre(a, b) {
    const da = parseFecha(a);
    const db = parseFecha(b);
    return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
  }

  window.mfFecha = {
    parseFecha,
    formatoFecha,
    formatoISO,
    formatoArchivo,
    sumarDias,
    sumarMeses,
    diasEntre
  };
})();
