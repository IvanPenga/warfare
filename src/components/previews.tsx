import { useEffect, useRef } from 'react';
import { getMaterialTexture, textureResolution } from '../rendering/material-textures';

export function MaterialPreview({ material }: { material: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const texture = getMaterialTexture(material, 0);
        const context = canvasRef.current?.getContext('2d');

        if (texture && context) {
            context.clearRect(0, 0, textureResolution, textureResolution);
            context.drawImage(texture, 0, 0);
        }
    }, [material]);

    return <canvas ref={canvasRef} width={textureResolution} height={textureResolution} className='preview' />;
}
