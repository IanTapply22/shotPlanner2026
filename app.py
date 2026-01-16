from flask import Flask, render_template, jsonify, request
import numpy as np
from numpy import arctan2, cos, degrees, pi, radians, sin, sqrt, tan
from scipy.integrate import quad, solve_ivp
from scipy.optimize import fsolve

app = Flask(__name__)

g = 9.81
rim_width = 1.04  # 42 inches
rim_height = 1.83  # 72 inches
cargo_radius = 0.15 / 2  # radius of ball in inches
drag_coeff = 0.23
cargo_mass = 0.21  # mass in Kg
air_density = 1.225
cargo_area = pi * cargo_radius**2


def get_speed_func_squared(startpt, endpt):
    x0, y0 = startpt
    x1, y1 = endpt
    return (
        lambda a: (0.5 * g / (y0 - y1 + (x1 - x0) * tan(a))) * ((x1 - x0) / cos(a)) ** 2
    )


def get_ang_speed_space(xpos, ypos):
    f_far_squared = get_speed_func_squared((xpos, ypos), (rim_width / 2, rim_height))
    f_near_squared = get_speed_func_squared((xpos, ypos), (-rim_width / 2, rim_height))
    f_squared_diff = lambda a: f_far_squared(a) - f_near_squared(a)
    intersection = fsolve(f_squared_diff, radians(85))[0]

    ang_lower_bound = max(intersection, radians(5))
    ang_upper_bound = radians(85)

    f_far = lambda a: sqrt(f_far_squared(a))
    f_near = lambda a: sqrt(f_near_squared(a))
    f_diff = lambda a: f_far(a) - f_near(a)
    area, error = quad(f_diff, ang_lower_bound, ang_upper_bound)

    angles = np.linspace(degrees(ang_lower_bound), degrees(ang_upper_bound), num=50)
    lower_bound_pts = np.vectorize(f_near)(radians(angles))
    upper_bound_pts = np.vectorize(f_far)(radians(angles))

    return {
        'area': area,
        'angles': angles.tolist(),
        'lower_bound': lower_bound_pts.tolist(),
        'upper_bound': upper_bound_pts.tolist()
    }


def flight_model(t, s):
    x, vx, y, vy = s
    dx = vx
    dy = vy

    v_squared = vx**2 + vy**2
    v = sqrt(v_squared)

    sin_component = vy / v
    cos_component = vx / v

    Fd = 0.5 * air_density * cargo_area * drag_coeff * v_squared

    Fx = -Fd * cos_component
    Fy = -Fd * sin_component - cargo_mass * g

    dvx = Fx / cargo_mass
    dvy = Fy / cargo_mass
    return [dx, dvx, dy, dvy]


def hit_ground(t, s):
    x, vx, y, vy = s
    return y


hit_ground.terminal = True


def hit_rim(t, s):
    x, vx, y, vy = s
    dist_to_rim = min(
        x - -rim_width / 2, -(y - rim_height)
    )
    return dist_to_rim + cargo_radius


hit_rim.terminal = True


def passed_rim(t, s):
    x, vx, y, vy = s
    return x - rim_width / 2


passed_rim.terminal = True


def try_shot(s0):
    t_span = (0, 5.0)
    solution = solve_ivp(
        flight_model,
        t_span,
        s0,
        events=[hit_ground, hit_rim, passed_rim],
        max_step=0.05,
    )

    result = 0  # default is success
    if solution.y[0][-1] < -rim_width / 2:
        result = -1  # undershot
    elif solution.y[0][-1] > rim_width / 2 - cargo_radius:
        result = 1  # overshot

    return {
        'result': result,
        'x': solution.y[0, :].tolist(),
        'y': solution.y[2, :].tolist()
    }


@app.route('/')
def index():
    return render_template('shot_planner.html')


@app.route('/api/calculate_trajectory', methods=['POST'])
def calculate_trajectory():
    data = request.json
    x = data['x']
    y = data['y']
    vx = data['vx']
    vy = data['vy']
    
    shoot_state = [x, vx, y, vy]
    result = try_shot(shoot_state)
    return jsonify(result)


@app.route('/api/calculate_ang_speed', methods=['POST'])
def calculate_ang_speed():
    data = request.json
    x = data['x']
    y = data['y']
    
    result = get_ang_speed_space(x, y)
    return jsonify(result)


@app.route('/api/generate_heatmap', methods=['GET'])
def generate_heatmap():
    x_range = np.arange(-6, -1, 0.2)
    y_range = np.arange(0.2, 1.25, 0.2)
    
    area_grid = []
    
    for xi in range(x_range.size):
        row = []
        for yi in range(y_range.size):
            area_data = get_ang_speed_space(x_range[xi], y_range[yi])
            area = area_data['area'] * arctan2(rim_width, abs(x_range[xi]))
            row.append(area)
        area_grid.append(row)
    
    return jsonify({
        'x_range': x_range.tolist(),
        'y_range': y_range.tolist(),
        'area_grid': area_grid
    })


if __name__ == '__main__':
    app.run(debug=True)
