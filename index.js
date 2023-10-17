// Importa los módulos AWS e IoT necesarios
import {
  CognitoIdentityClient,
  GetCredentialsForIdentityCommand,
  GetIdCommand,
} from '@aws-sdk/client-cognito-identity'
import {
  IoTDataPlaneClient,
  GetThingShadowCommand,
} from '@aws-sdk/client-iot-data-plane' // ES Modules import

import { mqtt, iot } from 'aws-iot-device-sdk-v2'

const Settings = require('./settings') // Importa la configuración personalizada

// Variable para control de luz
let light = 'on'

// Get the icon element by its id
const icon = document.getElementById('lightbulbIcon')
const loadingIcon = document.getElementById('loadingIcon')
const content = document.getElementById('content')
const button = document.getElementById('toggleButton')

// Configura el cliente de Cognito Identity
const client = new CognitoIdentityClient({ region: Settings.AWS_REGION })

// Obtiene el ID de identidad del Cognito Identity Pool
const getIdCommand = new GetIdCommand({
  IdentityPoolId: Settings.AWS_COGNITO_IDENTITY_POOL_ID, // Reemplaza con el ID de tu Identity Pool
})

const response = await client.send(getIdCommand)
const identityId = response.IdentityId

// Obtiene las credenciales temporales para la identidad
const getCredentialsCommand = new GetCredentialsForIdentityCommand({
  IdentityId: identityId,
})

const credentialsResponse = await client.send(getCredentialsCommand)

// Obtiene el estado actual del Shadow
const iotClient = new IoTDataPlaneClient({
  region: Settings.AWS_REGION,
  credentials: {
    accessKeyId: credentialsResponse.Credentials.AccessKeyId,
    secretAccessKey: credentialsResponse.Credentials.SecretKey,
    sessionToken: credentialsResponse.Credentials.SessionToken,
  },
})

const input = {
  thingName: Settings.AWS_IOT_THING,
}

// Actualizar el estado de la luz en la carga
const command = new GetThingShadowCommand(input)
const iotResponse = await iotClient
  .send(command)
  .then((response) => {
    const payload = JSON.parse(Buffer.from(response.payload))

    light = payload.state.reported.status === 'on' ? 'off' : 'on'
    changeIcon(payload.state.reported.status)
  })
  .catch((error) => {
    console.error('Error getting device shadow:', error)
  })

// Función para establecer una conexión WebSocket con IoT
async function connect_websocket(credentials) {
  return new Promise((resolve, reject) => {
    let config =
      iot.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket()
        .with_clean_session(true)
        .with_client_id(`pub_sub_sample(${new Date()})`)
        .with_endpoint(Settings.AWS_IOT_ENDPOINT)
        .with_credentials(
          Settings.AWS_REGION,
          credentials.AccessKeyId,
          credentials.SecretKey,
          credentials.SessionToken
        )
        .with_use_websockets()
        .with_keep_alive_seconds(30)
        .build()

    console.log('Connecting websocket...')
    const client = new mqtt.MqttClient()

    const connection = client.new_connection(config)
    connection.on('connect', (session_present) => {
      resolve(connection)
    })
    connection.on('interrupt', (error) => {
      console.log(`Connection interrupted: error=${error}`)
    })
    connection.on('resume', (return_code, session_present) => {
      console.log(
        `Resumed: rc: ${return_code} existing session: ${session_present}`
      )
    })
    connection.on('disconnect', () => {
      console.log('Disconnected')
    })
    connection.on('error', (error) => {
      reject(error)
    })
    connection.connect()
  })
}

// Inicializa la conexión WebSocket con las credenciales de Cognito obtenidas
const connectionPromise = connect_websocket(credentialsResponse.Credentials)

connectionPromise.then((connection) => {
  loadingIcon.style.display = 'none'
  content.style.display = 'block'
  connection.subscribe(
    Settings.AWS_IOT_PUBLISH_TOPIC + '/accepted',
    mqtt.QoS.AtLeastOnce,
    (topic, payload, dup, qos, retain) => {
      const status = JSON.parse(Buffer.from(payload))
      if (status?.state?.reported) {
        light = status?.state?.reported.status === 'on' ? 'off' : 'on'
        changeIcon(status.state.reported.status)
        button.disabled = false
      }
    }
  )
})

// Función asincrónica para publicar un mensaje en el topic
async function PublishMessage() {
  const msg = {
    state: {
      desired: {
        status: light,
      },
    },
  }

  // Utiliza la conexión para enviar el mensaje al Device Shadow
  connectionPromise.then((connection) => {
    connection
      .publish(Settings.AWS_IOT_PUBLISH_TOPIC, msg, mqtt.QoS.AtLeastOnce)
      .catch((reason) => {
        log(`Error publishing: ${reason}`)
      })
  })
}

// Comprobar el estado y cambiar el color del icono y el texto del botón
function changeIcon(reportedState) {
  if (reportedState === 'on') {
    // Si el estado informado es "on", cambia el color del icono a amarillo
    icon.classList.remove('text-gray-500')
    icon.classList.add('text-yellow-500')
    toggleButton.textContent = 'Apagar la Luz'
  } else {
    // Si el estado informado es "off", establece el color predeterminado (gris)
    icon.classList.remove('text-yellow-500')
    icon.classList.add('text-gray-500')
    toggleButton.textContent = 'Prender la Luz'
  }
}

// Escucha el evento de clic en el botón con ID 'toggleButton' y llama a la función PublishMessage
button.addEventListener('click', function () {
  PublishMessage()
  button.disabled = true
})
