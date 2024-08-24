export interface VitsConfig {
    name?: string
    type: 'GPT-SoVITS2' | 'gradio'
    url: string
    config: this extends { type: infer T }
        ? T extends 'GPT-SoVITS2'
            ? GPTSoVITS2Config
            : GradioConfig
        : GradioConfig
    speakers: (this extends { type: infer T }
        ? T extends 'GPT-SoVITS2'
            ? GPTSoVITS2Speaker
            : GradioSpeaker
        : BaseSpeaker)[]
}

export interface GPTSoVITS2Speaker extends BaseSpeaker, GPTSoVITS2Config {
    name: string

    gpt_weights?: string
    sovits_weights?: string
}

export interface BaseSpeaker {}

export interface GradioSpeaker extends BaseSpeaker {
    name: string
    fn_name: string
}

export interface GPTSoVITS2Request {
    ref_audio_path: string
    aux_ref_audio_paths: string[]
    prompt_text: string
    prompt_lang: string
    top_k?: number
    top_p?: number
    temperature?: number
    text_split_method: string
    batch_size: number
    batch_threshold?: number
    split_bucket?: boolean
    speed_factor?: number
    text: string
    text_lang: string
    seed?: number
    media_type?: string
}

export interface GPTSoVITS2Config
    extends Omit<GPTSoVITS2Request, 'text' | 'text_lang'> {}

export interface GradioConfig
    extends Record<string, string | boolean | number | string[]> {
    languages?: string[]
}
