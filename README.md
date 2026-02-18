# 🔌 Sistema IoT — Medidor de Consumo Eléctrico

## 📌 Descripción

Este proyecto consiste en el desarrollo de una solución IoT simulada que permite administrar, controlar y monitorear circuitos eléctricos mediante una API REST implementada en MockAPI.

La aplicación está dividida en tres módulos principales: Administración, Control y Monitoreo, los cuales permiten gestionar dispositivos IoT que simulan medidores de consumo eléctrico.

---

## 🎯 Objetivo

Desarrollar una solución web IoT que:

- Gestione al menos 3 dispositivos IoT.
- Utilice una base de datos simulada mediante MockAPI.
- Permita realizar operaciones CRUD.
- Permita el control mediante interruptores ON/OFF.
- Simule mediciones eléctricas reales.
- Muestre monitoreo en tiempo real con actualización cada 2 segundos.
- Implemente reglas lógicas para simular comportamiento real.

---

## 🏗️ Arquitectura del Proyecto

El sistema está dividido en 3 módulos:

### 1️⃣ Administración (CRUD)
Permite:
- Crear circuitos
- Editar información
- Definir límite de potencia
- Eliminar dispositivos
- Configurar estado inicial

---

### 2️⃣ Control
Permite:
- Encender / apagar circuitos
- Cambiar carga (baja, media, alta)
- Forzar lectura manual
- Calcular potencia automáticamente
- Detectar estado NORMAL o ALERTA

---

### 3️⃣ Monitoreo
Permite:
- Visualizar gráficas de comportamiento
- Mostrar últimos 10 estados
- Refresco automático cada 2 segundos
- Mostrar estado en tiempo real

---

## ⚙️ Reglas Lógicas Implementadas

- Potencia = Voltaje × Corriente
- Si Potencia > Límite → Estado = ALERTA
- Si Potencia ≤ Límite → Estado = NORMAL
- Energía acumulada cada 2 segundos:
  
  Energía += Potencia × (2 / 3600)

- Si el dispositivo está apagado:
  - Corriente = 0
  - Potencia = 0
  - Estado = NORMAL

---

## 🛠️ Tecnologías Utilizadas

- HTML5
- CSS3
- Bootstrap 5
- JavaScript (Vanilla)
- MockAPI (API REST simulada)
- Git & GitHub

---

## 🔗 Endpoint API
