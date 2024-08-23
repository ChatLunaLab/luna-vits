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

export interface GPTSoVITS2Speaker extends BaseSpeaker {
    name: string
    is_default?: boolean
    gpt_weights: this extends { is_default: infer T }
        ? T extends false
            ? string
            : never
        : never
    sovits_weights: this extends { is_default: infer T }
        ? T extends false
            ? string
            : never
        : never
}

export interface BaseSpeaker {}

export interface GradioSpeaker extends BaseSpeaker {
    name: string
    fn_name: string
}

export interface GPTSoVITS2Config {
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

    seed?: number
}

export interface GradioConfig
    extends Record<string, string | boolean | number | string[]> {
    languages?: string[]
}
