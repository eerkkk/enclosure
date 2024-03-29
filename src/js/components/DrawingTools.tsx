/* eslint-disable no-console */
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import FreehandMode from 'mapbox-gl-draw-freehand-mode';
import * as React from 'react';
import { ControlPosition, MapRef, useControl } from 'react-map-gl';

import { POLYGON_THEME } from '../constants/POLYGON_THEME';

import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

export let drawRef = null;

interface IDrawingTools {
	initialPolygon?: any;
	onCreate: (e: { features: Array<object> }) => void;
	onDelete: (e: { features: Array<object> }) => void;
	onUpdate: (e: { action: string; features: Array<object> }) => void;
}

type DrawControlProps = ConstructorParameters<typeof MapboxDraw>[ 0 ] & {
	controls?: any;
	displayControlsDefault?: boolean;
	modes?: any;
	onCreate?: IDrawingTools[ 'onCreate' ];
	onDelete?: IDrawingTools[ 'onDelete' ];
	onUpdate?: IDrawingTools[ 'onUpdate' ];
	position?: ControlPosition;
	styles?: any;
	userProperties?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
FreehandMode.simplify = function() {};
// The above line removes simplification that is provided by the turf.simplify method, remove this if it causes any bugs.

const allInclusiveModes = {
	...MapboxDraw.modes,
	draw_polygon: FreehandMode // https://github.com/bemky/mapbox-gl-draw-freehand-mode
};

const DrawControl: React.FC<DrawControlProps> = (props: DrawControlProps): JSX.Element => {
	drawRef = useControl<MapboxDraw>(
		({ map }: { map: MapRef }) => {
			map.on('draw.create', props.onCreate);
			map.on('draw.update', props.onUpdate);
			map.on('draw.delete', props.onDelete);

			return new MapboxDraw({ ...props, modes: allInclusiveModes });
		},
		({ map }: { map: MapRef }) => {
			map.off('draw.create', props.onCreate);
			map.off('draw.update', props.onUpdate);
			map.off('draw.delete', props.onDelete);
		},
		{
			position: props.position
		});

	return null;
};

const DrawingTools: React.FC<IDrawingTools> = (props: IDrawingTools): JSX.Element => {
	React.useEffect(() => {
		// drawRef?.add(props.initialPolygon);
	}, [ ]);

	return (
		<DrawControl
			// controls={ { trash: true } }
			displayControlsDefault={ false }
			onCreate={ props.onCreate }
			onDelete={ props.onDelete }
			onUpdate={ props.onUpdate }
			styles={ POLYGON_THEME }
			userProperties />
	);
};

export default DrawingTools;
