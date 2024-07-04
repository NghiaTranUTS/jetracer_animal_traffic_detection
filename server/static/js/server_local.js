const socket = io();
const IMG_SIZE = 416;
const END_PIX = IMG_SIZE - 1;
const MID_PIX = END_PIX / 2;

socket.on('connect', function() {
    console.log('Connected to server');
});

/**
 * Formats a number to a fixed decimal string.
 * @param {number} value - The number to format.
 * @returns {string} - The formatted number.
 */
function formatNumber(value) {
    return value.toFixed(4).padStart(7, '\u00A0');
}

/**
 * YoloOutput class representing a YOLO object detection output.
 */
class YoloOutput {
    static CATE_TO_COLOR = {
        lane: 'cyan',
        stp_sg: 'red',
        spd100: 'green',
        spd50: 'fuchsia',
        prk_sg: 'blue',
        trf_lgt: 'purple',
        bird: 'red',
        feline: 'yellow',
        herbivore: 'white',
        logo: 'blue'
    };

    static CATE_TO_NAME = {
        lane: 'Lane',
        stp_sg: 'Stop',
        spd100: 'Speed Limit 100',
        spd50: 'Speed Limit 50',
        prk_sg: 'Parking',
        trf_lgt: 'Traffic Light',
        bird: 'Bird',
        feline: 'Feline',
        herbivore: 'Herbivore',
        logo: 'Park Zone'
    };

    /**
     * Constructor for YoloOutput.
     * @param {string} cate - Category of the detected object.
     * @param {number} conf - Confidence score of the detection.
     * @param {number} xMin - Minimum X coordinate of the bounding box.
     * @param {number} yMin - Minimum Y coordinate of the bounding box.
     * @param {number} xMax - Maximum X coordinate of the bounding box.
     * @param {number} yMax - Maximum Y coordinate of the bounding box.
     */
    constructor(cate, conf, xMin, yMin, xMax, yMax) {
        this.cate = cate;
        this.color = YoloOutput.CATE_TO_COLOR[cate] || 'black';
        this.nameDisplay = YoloOutput.CATE_TO_NAME[cate] || cate;
        this.conf = conf;
        this.xMin = xMin;
        this.yMin = yMin;
        this.xMax = xMax;
        this.yMax = yMax;
        this.xCen = (xMin + xMax) / 2;
        this.yCen = (yMin + yMax) / 2;
    }

    /**
     * Converts a dense string to a YoloOutput object.
     * @param {string} denseStr - The dense string to convert.
     * @returns {YoloOutput} - The YoloOutput object.
     */
    static fromDenseStr(denseStr) {
        const parts = denseStr.split('|');
        if (parts.length !== 6) {
            throw new Error(`Invalid YoloOutput dense format: ${denseStr}`);
        }
        return new YoloOutput(
            parts[0],
            parseFloat(parts[1]),
            parseFloat(parts[2]),
            parseFloat(parts[3]),
            parseFloat(parts[4]),
            parseFloat(parts[5])
        );
    }
}

class ImageUpdateData {
    /**
     * Constructor for ImageUpdateData.
     * @param {Object} data - The data object received from the server.
     * @param {string} data.image - Base64 encoded image string.
     * @param {string} data.list_lane_dense - JSON string of lane data.
     * @param {string} data.sign_dense - Dense string of sign data.
     * @param {string} data.list_anim_dense - JSON string of animal data.
     * @param {string} data.logo_dense - Dense string of sign data.
     * @param {number} data.throttle - Throttle value.
     * @param {number} data.steering - Steering value.
     * @param {number} data.lane_x - X-coordinate of the lane.
     */
    constructor(data) {
        /** @type {string} */
        this.image = data.image;
        /** @type {string} */
        this.listLaneDense = data.list_lane_dense;
        /** @type {string} */
        this.signDense = data.sign_dense;
        /** @type {string} */
        this.listAnimDense = data.list_anim_dense;
        /** @type {string} */
        this.logoDense = data.logo_dense;
        /** @type {number} */
        this.throttle = data.throttle;
        /** @type {number} */
        this.steering = data.steering;
        /** @type {number} */
        this.laneX = data.lane_x;

        /** @type {Array<YoloOutput>} */
        this.listLane = JSON.parse(this.listLaneDense).map(YoloOutput.fromDenseStr);
        /** @type {YoloOutput} */
        this.sign = YoloOutput.fromDenseStr(this.signDense);
        /** @type {string} */
        this.signName = this.sign.nameDisplay;
        /** @type {Array<YoloOutput>} */
        this.listAnimal = JSON.parse(this.listAnimDense).map(YoloOutput.fromDenseStr);
        /** @type {YoloOutput} */
        this.logoPad = YoloOutput.fromDenseStr(this.logoDense);
    }
}

/**
 * Draws detections on a canvas context.
 * @param {CanvasRenderingContext2D} ctx - The canvas context to draw on.
 * @param {YoloOutput} sign - Sign detection.
 * @param {Array<YoloOutput>} listAnimal - List of animal detections.
 * @param {YoloOutput} logoPad - Sign detection.
 */
function drawDetections(ctx, sign, listAnimal, logoPad) {
    ctx.lineWidth = 2;
    if (sign && sign.cate !== 'clear') {
        ctx.strokeStyle = sign.color;
        ctx.strokeRect(sign.xMin, sign.yMin, sign.xMax - sign.xMin, sign.yMax - sign.yMin);
    }
    if (listAnimal) {
        listAnimal.forEach(animal => {
            ctx.strokeStyle = animal.color;
            ctx.strokeRect(animal.xMin, animal.yMin, animal.xMax - animal.xMin, animal.yMax - animal.yMin);
        });
    }
    if (logoPad && logoPad.cate !== 'clear') {
        ctx.strokeStyle = logoPad.color;
        ctx.strokeRect(logoPad.xMin, logoPad.yMin, logoPad.xMax - logoPad.xMin, logoPad.yMax - logoPad.yMin);
    }
}

/**
 * Draws reference lines on a canvas context.
 * @param {CanvasRenderingContext2D} ctx - The canvas context to draw on.
 * @param {Array<YoloOutput>} listLane - List of lane detections.
 * @param {number} laneX - X-coordinate of the lane.
 */
function drawReferenceLines(ctx, listLane, laneX) {
    const circleRadius = 4;
    ctx.fillStyle = 'red';

    // Draw circle at laneX and MID_PIX
    ctx.beginPath();
    ctx.arc(laneX, MID_PIX, circleRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'blue';
    // Sort lanes by yCen
    listLane.sort((a, b) => a.yCen - b.yCen);

    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 1;

    let x1, y1, x2, y2, yAtX0, yAtXMax, slope, intercept;
    if (listLane.length >= 2) {
        // Draw a line through the two points with the lowest yCen
        x1 = listLane[0].xCen;
        y1 = listLane[0].yCen;
        x2 = listLane[1].xCen;
        y2 = listLane[1].yCen;
        slope = (y2 - y1) / (x2 - x1);
        intercept = y1 - slope * x1;
        // Calculate intersection points with the image borders
        yAtX0 = intercept;
        yAtXMax = slope * IMG_SIZE + intercept;
    } else if (listLane.length === 1) {
        // Draw a line from the single point to the midpoint at the bottom of the canvas
        x1 = listLane[0].xCen;
        y1 = listLane[0].yCen;
        slope = (END_PIX - y1) / (MID_PIX - x1);
        intercept = y1 - slope * x1;
        // Calculate intersection points with the image borders
        yAtX0 = intercept;
        yAtXMax = slope * IMG_SIZE + intercept;
    } else {
        // No lane detections, draw a vertical line from the bottom center to the top
        ctx.beginPath();
        ctx.moveTo(MID_PIX, END_PIX);
        ctx.lineTo(MID_PIX, 0);
        ctx.stroke();
        return; // Exit the function early
    }

    ctx.beginPath();
    ctx.moveTo(0, yAtX0);
    ctx.lineTo(IMG_SIZE, yAtXMax);
    ctx.stroke();

    // Draw circles at the center of each detected lane
    listLane.forEach(lane => {
        ctx.beginPath();
        ctx.arc(lane.xCen, lane.yCen, circleRadius, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Draw the three lines
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;

    // Vertical lines at 0.4 and 0.6 of the width
    ctx.beginPath();
    ctx.moveTo(0.4 * IMG_SIZE, 0);
    ctx.lineTo(0.4 * IMG_SIZE, IMG_SIZE);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0.6 * IMG_SIZE, 0);
    ctx.lineTo(0.6 * IMG_SIZE, IMG_SIZE);
    ctx.stroke();

    // Horizontal line at 0.7 of the height
    ctx.beginPath();
    ctx.moveTo(0, 0.7 * IMG_SIZE);
    ctx.lineTo(IMG_SIZE, 0.7 * IMG_SIZE);
    ctx.stroke();
}

/**
 * Confirms stop action and sends stop command if confirmed.
 */
function confirmStop() {
    if (confirm("Are you sure you want to stop?")) {
        sendGetCommand("end").then(ignore => {});
    }
}

/**
 * Sends a command to the server.
 * @param {string} command - The command to send.
 * @returns {Promise<void>}
 */
async function sendGetCommand(command) {
    try {
        const response = await fetch(`/jetson_command?racer=${command}`);
        const result = await response.json();
        if (response.ok) {
            console.log('Command executed: ' + result.racer);
        } else {
            console.error('Error: ' + result.message);
        }
    } catch (error) {
        console.error('Error: ' + error.message);
    }
}
